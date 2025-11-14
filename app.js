document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Element References ---
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const chatContainer = document.getElementById('chat-container');
  const providerSelect = document.getElementById('provider-select');
  
  // URL of our backend server
  const API_URL = `hhttps://sophia-sophia.onrender.com/api/chat`;
  // --- Client-side State ---
  // We mirror the session_state.messages from the Python example
  let messages = [];

  // --- Event Listeners ---
  chatForm.addEventListener('submit', handleChatSubmit);

  /**
   * Handles the submission of the chat form.
   */
  async function handleChatSubmit(e) {
    e.preventDefault(); // Prevent default form submission
    
    const prompt = chatInput.value.trim();
    if (!prompt) return; // Do nothing if input is empty

    const provider = providerSelect.value;
    
    // 1. Add user's message to state and UI
    messages.push({ role: 'user', content: prompt });
    addMessageToUI('user', prompt);

    // Clear the input and disable the form
    chatInput.value = '';
    chatInput.disabled = true;

    // 2. Create an empty assistant message bubble to stream into
    const assistantMessageElement = addMessageToUI('assistant', '...');
    let fullResponse = '';

    try {
      // 3. Make the streaming request to our backend
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messages,
          provider: provider,
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      // 4. Handle the stream from the backend
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      assistantMessageElement.innerText = ''; // Clear the "..."

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break; // Stream finished
        }
        
        const token = decoder.decode(value, { stream: true });
        fullResponse += token;
        assistantMessageElement.innerText = fullResponse; // Append token
        chatContainer.scrollTop = chatContainer.scrollHeight; // Auto-scroll
      }

      // 5. Add the final, complete assistant response to our state
      messages.push({ role: 'assistant', content: fullResponse });

    } catch (error) {
      console.error(error);
      assistantMessageElement.innerText = `Error: ${error.message}`;
      assistantMessageElement.style.color = 'red';
    } finally {
      // Re-enable the form
      chatInput.disabled = false;
      chatInput.focus();
    }
  }

  /**
   * Helper function to add a message to the DOM.
   * @param {'user' | 'assistant'} role - The role of the sender.
   * @param {string} content - The message content.
   * @returns {HTMLElement} The created message element.
   */
  function addMessageToUI(role, content) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message', role);
    messageElement.innerText = content; // Using innerText to prevent HTML injection
    chatContainer.appendChild(messageElement);
    chatContainer.scrollTop = chatContainer.scrollHeight; // Auto-scroll
    return messageElement;
  }
});