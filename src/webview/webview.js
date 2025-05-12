(function() {
    // Get VS Code API
    const vscode = acquireVsCodeApi();
    
    // DOM elements
    const prompt = document.getElementById('prompt');
    const responseDiv = document.getElementById('response');
    const askBtn = document.getElementById('askBtn');
    const stopBtn = document.getElementById('stopBtn');
    const statusDiv = document.getElementById('status');
    const statusText = document.getElementById('status-text');
    const questionContainer = document.getElementById('question-container');
    const questionContent = document.getElementById('question-content');

    // Configure marked options
    marked.setOptions({
        gfm: true,
        breaks: true,
        headerIds: false,
        mangle: false
    });

    // Function to adjust textarea height based on content
    function adjustTextareaHeight() {
        prompt.style.height = 'auto';
        prompt.style.height = (prompt.scrollHeight) + 'px';
    }
    
    // Show/hide loading status
    function showLoading(message = 'Processing...') {
        statusText.textContent = message;
        statusDiv.style.display = 'flex';
        askBtn.disabled = true;
        stopBtn.style.display = 'inline-block';
    }
    
    function hideLoading() {
        statusDiv.style.display = 'none';
        askBtn.disabled = false;
        stopBtn.style.display = 'none';
    }
    
    // Store the current question
    let currentQuestion = '';
    
    // Send message to extension
    function sendMessage() {
        const text = prompt.value.trim();
        if (!text) {return;}
        
        // Store the question
        currentQuestion = text;
        
        // Show the question in the separate box IMMEDIATELY
        questionContainer.style.display = 'flex';
        questionContent.innerHTML = marked.parse(text);
        
        // Show loading AND stop button immediately with specific message
        showLoading('Connecting to DeepSeek...');
        statusDiv.classList.add('thinking');
        
        // Send message to extension
        vscode.postMessage({ command: 'chat', text });
        
        // Clear the response area for new conversation
        responseDiv.innerHTML = '';
        
        // Add AI response header to response container
        const aiHeaderDiv = document.createElement('div');
        aiHeaderDiv.innerHTML = '<div class="message-header">DeepSeek:</div>';
        responseDiv.appendChild(aiHeaderDiv);
        
        // Clear input and reset height
        prompt.value = '';
        adjustTextareaHeight();
        
        // Scroll response container to bottom
        scrollToBottom();
        
        // Progressive status updates with more detailed messages
        setTimeout(() => {
            if (statusDiv.style.display !== 'none') {
                showLoading('Waiting for DeepSeek to process your request...');
                statusDiv.classList.remove('thinking');
                statusDiv.classList.add('responding');
            }
        }, 2000);
        
        setTimeout(() => {
            if (statusDiv.style.display !== 'none') {
                showLoading('DeepSeek is thinking deeply about your question...');
            }
        }, 5000);
        
        setTimeout(() => {
            if (statusDiv.style.display !== 'none') {
                showLoading('Still processing... (This might take a while for complex questions)');
            }
        }, 10000);
    }

    function stopGeneration() {
        // Send stop command to extension
        vscode.postMessage({ command: 'stop' });
        hideLoading();
        // Keep question visible even when stopped
    }

    function scrollToBottom() {
        responseDiv.parentElement.scrollTop = responseDiv.parentElement.scrollHeight;
    }
    
    // Initial setup
    function initialize() {
        // Initial focus
        prompt.focus();
        
        // Auto-resize on input
        prompt.addEventListener('input', adjustTextareaHeight);
        
        // Also adjust when window resizes
        window.addEventListener('resize', adjustTextareaHeight);
        
        // Handle button clicks
        askBtn.addEventListener('click', sendMessage);
        stopBtn.addEventListener('click', stopGeneration);
        
        // Handle Enter key (with Shift+Enter for new line)
        prompt.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
    
    // Accumulate response content
    let accumulatedContent = '';
    let responseElement = null;
    let typingIndicator = null;
    
    // Handle messages from extension
    window.addEventListener('message', event => {
        const { command, text, isComplete, isStopped } = event.data;
        
        if (command === 'clearResponse') {
            responseDiv.innerHTML = '';
            accumulatedContent = '';
            responseElement = null;
            typingIndicator = null;
            // DON'T hide question on clearResponse
            // Clear any CSS classes from statusDiv
            statusDiv.classList.remove('thinking', 'responding', 'generating');
        } else if (command === 'chatResponse') {
            // Show first response (update loading status when we start getting data)
            if (accumulatedContent === '') {
                statusDiv.classList.remove('thinking', 'responding');
                statusDiv.classList.add('generating');
                showLoading('DeepSeek is responding...');
                // Create response element
                responseElement = document.createElement('div');
                responseElement.classList.add('ai-response');
                responseDiv.appendChild(responseElement);
                
                // Create typing indicator
                typingIndicator = document.createElement('div');
                typingIndicator.classList.add('typing-indicator');
                typingIndicator.innerHTML = '<div class="typing-dots"><span>•</span><span>•</span><span>•</span></div><span class="typing-text">DeepSeek is thinking...</span>';
                responseDiv.appendChild(typingIndicator);
            }
            
            accumulatedContent += text;
            
            // Update response content with accumulated text
            const htmlContent = marked.parse(accumulatedContent);
            responseElement.innerHTML = htmlContent;
            
            // Update typing indicator text while generating
            if (typingIndicator && !isComplete && !isStopped) {
                typingIndicator.querySelector('.typing-text').textContent = 'DeepSeek is typing...';
            }
            
            // Update loading status when we're actually receiving content
            if (text && text.trim()) {
                showLoading('Generating response...');
            }
            
            // Scroll to bottom
            scrollToBottom();
            
            // If response is complete or stopped
            if (isComplete || isStopped) {
                hideLoading();
                statusDiv.classList.remove('thinking', 'responding', 'generating');
                
                // Remove typing indicator
                if (typingIndicator) {
                    typingIndicator.remove();
                    typingIndicator = null;
                }
                
                const completionDiv = document.createElement('div');
                if (isStopped) {
                    completionDiv.classList.add('response-stopped');
                    completionDiv.textContent = 'Response stopped by user';
                } else {
                    completionDiv.classList.add('response-complete');
                    completionDiv.textContent = 'Response complete';
                }
                responseDiv.appendChild(completionDiv);
                scrollToBottom();
                
                // Keep question visible after completion
            }
        } else if (command === 'error') {
            hideLoading();
            statusDiv.classList.remove('thinking', 'responding', 'generating');
            
            // Remove typing indicator on error
            if (typingIndicator) {
                typingIndicator.remove();
                typingIndicator = null;
            }
            
            const errorDiv = document.createElement('div');
            errorDiv.classList.add('error');
            errorDiv.textContent = text;
            responseDiv.appendChild(errorDiv);
            
            // Keep question visible even on error
        }
    });
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();