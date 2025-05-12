// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, exec } from 'child_process';
import ollama from 'ollama';

// AbortController to handle stopping requests
let currentAbortController: AbortController | null = null;

// Function to check for Nvidia GPU
async function checkNvidiaGPU(): Promise<{ hasGPU: boolean; gpuInfo?: string; error?: string }> {
    return new Promise((resolve) => {
        exec('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits', (error, stdout, stderr) => {
            if (error) {
                // nvidia-smi not found or no GPU
                resolve({ 
                    hasGPU: false, 
                    error: error.message.includes('not found') ? 'nvidia-smi not found' : error.message 
                });
                return;
            }
            
            if (stdout.trim()) {
                // GPU found, parse the output
                const gpuLines = stdout.trim().split('\n');
                const gpuInfo = gpuLines.map(line => {
                    const [name, memory] = line.split(',').map(s => s.trim());
                    return `${name} (${memory}MB)`;
                }).join(', ');
                
                resolve({ hasGPU: true, gpuInfo });
            } else {
                resolve({ hasGPU: false, error: 'No Nvidia GPUs detected' });
            }
        });
    });
}

// Function to check if .ollama directory exists
function checkOllamaDirectory(): { exists: boolean; path?: string } {
    const currentDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const ollamaPath = path.join(currentDir, '.ollama');
    
    try {
        const exists = fs.existsSync(ollamaPath) && fs.statSync(ollamaPath).isDirectory();
        return { exists, path: exists ? ollamaPath : undefined };
    } catch (error) {
        return { exists: false };
    }
}

// Function to start Ollama with custom environment
async function startOllamaWithCustomEnv(ollamaDir: string): Promise<{ success: boolean; process?: any; error?: string }> {
    return new Promise((resolve) => {
        // PowerShell command to set environment variables and start Ollama
        const powershellCommand = `
            $env:OLLAMA_MODELS = "${ollamaDir}"
            $env:OLLAMA_HOST = "127.0.0.1:11500"
            ollama serve
        `;

        const child = spawn('powershell.exe', ['-NoProfile', '-Command', powershellCommand], {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                OLLAMA_MODELS: ollamaDir,
                OLLAMA_HOST: "127.0.0.1:11500"
            }
        });
        
        let output = '';
        let errorOutput = '';
        
        child.stdout?.on('data', (data) => {
            output += data.toString();
            console.log('Ollama output:', data.toString());
        });
        
        child.stderr?.on('data', (data) => {
            errorOutput += data.toString();
            console.error('Ollama error:', data.toString());
        });
        
        // Give it some time to start
        setTimeout(() => {
            if (output.includes('Ollama is running') || !errorOutput.includes('error')) {
                resolve({ success: true, process: child });
            } else {
                resolve({ success: false, error: errorOutput || 'Failed to start Ollama' });
            }
        }, 3000);
        
        child.on('error', (error) => {
            resolve({ success: false, error: error.message });
        });
    });
}

// Function to check Ollama status
async function checkOllamaStatus(customHost?: string): Promise<{ isRunning: boolean; error?: string }> {
    return new Promise((resolve) => {
        const env = customHost ? { ...process.env, OLLAMA_HOST: customHost } : process.env;
        
        exec('ollama list', { env }, (error, stdout, stderr) => {
            if (error) {
                resolve({ 
                    isRunning: false, 
                    error: error.message.includes('not found') ? 'Ollama not installed' : 'Ollama not running' 
                });
                return;
            }
            resolve({ isRunning: true });
        });
    });
}

export function activate(context: vscode.ExtensionContext) {
    console.log('DeepSeek Chat extension is now active');

    let ollamaProcess: any = null;

    const disposable = vscode.commands.registerCommand('vscode-llm-chat.start', async () => {
        // Show initial loading message
        const progressOptions: vscode.ProgressOptions = {
            location: vscode.ProgressLocation.Notification,
            title: "LLM Chat",
            cancellable: false
        };
        
        await vscode.window.withProgress(progressOptions, async (progress, token) => {
            progress.report({ message: "Checking system requirements..." });
            
            // Check for Nvidia GPU
            const gpuCheck = await checkNvidiaGPU();
            
            // Check for .ollama directory
            progress.report({ message: "Checking for .ollama directory..." });
            const ollamaDir = checkOllamaDirectory();
            
            let customHost: string | undefined;
            
            // if (ollamaDir.exists && ollamaDir.path) {
            //     progress.report({ message: "Found .ollama directory. Starting Ollama with custom settings..." });
                
            //     // Try to start Ollama with custom environment
            //     const ollamaStart = await startOllamaWithCustomEnv(ollamaDir.path);
                
            //     if (ollamaStart.success) {
            //         ollamaProcess = ollamaStart.process;
            //         customHost = "127.0.0.1:11500";
            //         console.log('Ollama started with custom environment');
                    
            //         // Wait a bit more for Ollama to fully initialize
            //         progress.report({ message: "Waiting for Ollama to initialize..." });
            //         await new Promise(resolve => setTimeout(resolve, 2000));
            //     } else {
            //         vscode.window.showWarningMessage(
            //             `Failed to start Ollama with custom settings: ${ollamaStart.error}\nTrying standard Ollama setup...`
            //         );
            //     }
            // }
            
            // Check Ollama status
            progress.report({ message: "Checking Ollama status..." });
            const ollamaCheck = await checkOllamaStatus(customHost);
            
            // Prepare warning messages
            let warnings: string[] = [];
            
            if (!gpuCheck.hasGPU) {
                warnings.push(`No Nvidia GPU detected: ${gpuCheck.error || 'Unknown error'}`);
                warnings.push('• The model may run slowly on CPU');
                warnings.push('• Consider using a machine with Nvidia GPU for better performance');
            } else {
                console.log(`GPU detected: ${gpuCheck.gpuInfo}`);
            }
            
            if (!ollamaCheck.isRunning) {
                warnings.push(`Ollama issue: ${ollamaCheck.error || 'Unknown error'}`);
                warnings.push('• Make sure Ollama is installed and running');
                if (!ollamaDir.exists) {
                    warnings.push('• Run "ollama serve" in terminal if needed');
                }
            } else if (customHost) {
                // Show info that custom Ollama is running
                vscode.window.showInformationMessage(
                    `Ollama started with custom settings:\n• Models: ${ollamaDir.path}\n• Host: ${customHost}`
                );
            }
            
            // Show warnings if any
            if (warnings.length > 0) {
                const message = warnings.join('\n');
                const action = await vscode.window.showWarningMessage(
                    message,
                    { modal: true },
                    'Continue Anyway',
                    'Cancel'
                );
                
                if (action === 'Cancel') {
                    // Clean up Ollama process if we started it
                    if (ollamaProcess) {
                        ollamaProcess.kill();
                    }
                    return;
                }
            }
            
            progress.report({ message: "Starting chat interface..." });
        });
        
        // Create and show the webview panel
        const panel = vscode.window.createWebviewPanel(
            'deepChat',
            'DeepSeek Chat',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'src', 'webview')
                ]
            }
        );

        // Clean up Ollama process when panel is closed
        panel.onDidDispose(() => {
            if (ollamaProcess) {
                console.log('Cleaning up Ollama process...');
                ollamaProcess.kill();
                ollamaProcess = null;
            }
            // Abort any ongoing request
            if (currentAbortController) {
                currentAbortController.abort();
                currentAbortController = null;
            }
        });

        // Get paths to resources
        const htmlPath = vscode.Uri.joinPath(context.extensionUri, 'src', 'webview', 'deepseekChat.html');
        const scriptPath = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(context.extensionUri, 'src', 'webview', 'webview.js')
        );
        const stylePath = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(context.extensionUri, 'src', 'webview', 'styles.css')
        );

        // Get HTML content and inject script and style paths
        let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');
        htmlContent = htmlContent
            .replace('{{scriptUri}}', scriptPath.toString())
            .replace('{{styleUri}}', stylePath.toString());
        
        panel.webview.html = htmlContent;

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(async (message: any) => {
            if (message.command === 'chat') {
                const userPrompt = message.text;

                // Create new AbortController for this request
                currentAbortController = new AbortController();

                try {
                    // Clear the response area and show that we're connecting
                    panel.webview.postMessage({ command: 'clearResponse' });
                    
                    // Add a small delay to make sure the UI updates
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    const streamResponse = await ollama.chat({
                        model: 'deepseek-r1:14b-qwen-distill-q4_K_M',
                        messages: [
                            {role: 'user', content: userPrompt}
                        ],
                        stream: true
                    });

                    let buffer = '';
                    let isStopped = false;
                    
                    // Check if request was aborted before starting
                    if (currentAbortController.signal.aborted) {
                        isStopped = true;
                        panel.webview.postMessage({ 
                            command: 'chatResponse', 
                            text: '',
                            isComplete: false,
                            isStopped: true
                        });
                        return;
                    }

                    for await (const part of streamResponse) {
                        // Check if request was aborted during streaming
                        if (currentAbortController.signal.aborted) {
                            isStopped = true;
                            break;
                        }

                        const cleanedContent = part.message.content.replace(/<think>/g, '').replace(/<\/think>/g, '');
                        buffer += cleanedContent;
                        
                        // Process and send chunks in larger batches for better rendering
                        if (buffer.length > 20 || part.done) {
                            // Send the raw text to be processed by marked.js in the webview
                            panel.webview.postMessage({ 
                                command: 'chatResponse', 
                                text: buffer,
                                isComplete: part.done && !isStopped,
                                isStopped: isStopped
                            });
                            buffer = '';
                        }
                    }

                    // If stopped, send final message
                    if (isStopped) {
                        panel.webview.postMessage({ 
                            command: 'chatResponse', 
                            text: '',
                            isComplete: false,
                            isStopped: true
                        });
                    }
                } catch (err) {
                    console.error('Ollama API error:', err);
                    panel.webview.postMessage({ 
                        command: 'error', 
                        text: 'Error connecting to Ollama API. Make sure the service is running and the model is available.'
                    });
                } finally {
                    // Clean up the abort controller
                    currentAbortController = null;
                }
            } else if (message.command === 'stop') {
                // Handle stop request
                if (currentAbortController) {
                    currentAbortController.abort();
                }
            }
        });
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {
    // This will be called when the extension is deactivated
    // The Ollama process will be cleaned up when the panel is closed
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }
}