# 💬 VSCode LLM Chat Extension

This VS Code extension allows you to chat directly with local LLM models served via [Ollama](https://ollama.com/).  

> 📌 **Current Default Model:** `deepseek-r1:14b-qwen-distill-q4_K_M`  
> • Model Family: Qwen (by Alibaba)  
> • Parameters: 14 Billion (Distilled Version)  
> • Quantization: Q4_K_M (4-bit optimized for fast inference and low memory usage)  

---

## 📥 **Prerequisites**
- [Node.js](https://nodejs.org/) installed  
- [Ollama](https://ollama.com/) installed

---

## 🚀 **Setup Instructions**

1. **Install Dependencies**
```sh
npm install
```

2. **Pull or Run the Required Model**

Using Ollama, pull or run the desired model:
```sh
ollama run deepseek-r1:14b-qwen-distill-q4_K_M
```

## **Changing the Model**

If you want to use a different model, update the following code in `src/extension.ts`:

```ts
const streamResponse = await ollama.chat({
    model: 'deepseek-r1:14b-qwen-distill-q4_K_M',  // Change this to your desired model name
    messages: [
        { role: 'user', content: userPrompt }
    ],
    stream: true
});
```