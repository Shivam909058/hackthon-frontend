// --- src/app.js ---
import { Conversation } from '@11labs/client';

const API_URL = process.env.REACT_APP_API_URL || 'https://hackthon-backend-zeta.vercel.app';

let conversation = null;
let currentTheme = 'light';

// Add these variables for stateful session management
let userId = localStorage.getItem('voicechat_userId') || null;
let sessionId = null;
let conversationHistory = [];
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Add this near the top of your existing file, with other variable declarations
let reminderCheckInterval = null;
let isWaitingForDelay = false;
let delayCheckInterval = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Theme toggle
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    themeToggleBtn.addEventListener('click', toggleTheme);
    
    // Initialize buttons
    document.getElementById('startButton').addEventListener('click', startConversation);
    document.getElementById('endButton').addEventListener('click', endConversation);
    
    // Initialize frequency animation
    animateFrequencyBars();
    
    // Ensure waves are visible
    ensureWavesAreVisible();
    
    // Add event listener for unload/beforeunload to end session
    window.addEventListener('beforeunload', endSessionOnUnload);
    
    // Initialize user ID if not present
    if (!userId) {
        userId = generateUserId();
        localStorage.setItem('voicechat_userId', userId);
    }
});

// Generate a simple user ID
function generateUserId() {
    return 'user_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// End session when page is closed
function endSessionOnUnload() {
    if (sessionId) {
        // Use sendBeacon for reliable delivery during page unload
        navigator.sendBeacon(`${API_URL}/api/end-session`, JSON.stringify({
            sessionId
        }));
        
        // Also try to end the conversation
        if (conversation) {
            try {
                conversation.endSession();
            } catch (e) {
                // Ignore errors during page unload
            }
        }
    }
}

// Theme toggle function
function toggleTheme() {
    const html = document.documentElement;
    const themeIcon = document.getElementById('themeIcon');
    
    if (currentTheme === 'dark') {
        html.removeAttribute('data-theme');
        themeIcon.className = 'fas fa-moon';
        currentTheme = 'light';
    } else {
        html.setAttribute('data-theme', 'dark');
        themeIcon.className = 'fas fa-sun';
        currentTheme = 'dark';
    }
}

// Animate frequency bars
function animateFrequencyBars() {
    const bars = document.querySelectorAll('.frequency-bar');
    setInterval(() => {
        if (document.getElementById('frequencyBars').classList.contains('active')) {
            bars.forEach(bar => {
                const height = Math.random() * 40 + 10;
                bar.style.height = `${height}px`;
            });
        }
    }, 100);
}

// Request microphone permission
async function requestMicrophonePermission() {
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        return true;
    } catch (error) {
        console.error('Microphone permission denied:', error);
        return false;
    }
}

// Get signed URL from the backend
async function getSignedUrl() {
    try {
        const response = await fetch(`${API_URL}/api/signed-url?userId=${userId}${sessionId ? `&sessionId=${sessionId}` : ''}`);
        if (!response.ok) throw new Error('Failed to get signed URL');
        const data = await response.json();
        
        // Store session ID if returned
        if (data.sessionId) {
            sessionId = data.sessionId;
        }
        
        return data.signedUrl;
    } catch (error) {
        console.error('Error getting signed URL:', error);
        throw error;
    }
}

// Get agent ID from the backend
async function getAgentId() {
    try {
        const response = await fetch(`${API_URL}/api/getAgentId`);
        if (!response.ok) throw new Error('Failed to get agent ID');
        const data = await response.json();
        return data.agentId;
    } catch (error) {
        console.error('Error getting agent ID:', error);
        throw error;
    }
}

// Keep session alive
function startKeepAliveInterval() {
    // Clear any existing interval
    if (window.keepAliveInterval) {
        clearInterval(window.keepAliveInterval);
    }
    
    // Set up new interval if we have a session ID
    if (sessionId) {
        window.keepAliveInterval = setInterval(async () => {
            try {
                if (sessionId) {
                    await fetch(`${API_URL}/api/keep-alive`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ sessionId })
                    });
                }
            } catch (error) {
                console.error('Error in keep-alive:', error);
            }
        }, 30000); // Every 30 seconds
    }
}

// Store conversation for memory
async function storeConversationMemory(userMessage, assistantMessage) {
    try {
        if (!sessionId || !userId) return;
        
        const messages = [
            { role: "user", content: userMessage },
            { role: "assistant", content: assistantMessage }
        ];
        
        // Store in backend memory system
        await fetch(`${API_URL}/api/store-conversation`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId,
                sessionId,
                messages
            })
        });
    } catch (error) {
        console.error('Error storing conversation memory:', error);
    }
}

// Update connection status UI
function updateConnectionStatus(isConnected) {
    const connectionIndicator = document.getElementById('connectionIndicator');
    const connectionStatus = document.getElementById('connectionStatus');
    const voiceCard = document.getElementById('voiceCard');
    
    if (isConnected) {
        connectionIndicator.classList.add('connected');
        connectionStatus.textContent = 'Connected';
        voiceCard.classList.add('active');
    } else {
        connectionIndicator.classList.remove('connected');
        connectionStatus.textContent = 'Disconnected';
        voiceCard.classList.remove('active');
        
        // Reset UI components
        updateSpeakingStatus({ mode: 'listening' });
    }
}

// Update speaking status UI
function updateSpeakingStatus(mode) {
    const speakingIndicator = document.getElementById('speakingIndicator');
    const speakingStatus = document.getElementById('speakingStatus');
    const visualizerOrb = document.getElementById('visualizerOrb');
    const soundWaves = document.getElementById('soundWaves');
    const frequencyBars = document.getElementById('frequencyBars');
    const particles = document.getElementById('particles');
    const orbIcon = document.getElementById('orbIcon');
    
    const isSpeaking = mode.mode === 'speaking';
    
    if (isSpeaking) {
        speakingIndicator.classList.add('speaking');
        speakingStatus.textContent = 'AI Speaking';
        visualizerOrb.classList.add('active');
        soundWaves.classList.add('active');
        frequencyBars.classList.add('active');
        particles.classList.add('active');
        orbIcon.className = 'fas fa-volume-up orb-icon';
        
        // Intensify background waves during speaking
        document.querySelectorAll('.wave-layer').forEach(layer => {
            layer.style.animationDuration = '10s';
        });
    } else {
        speakingIndicator.classList.remove('speaking');
        speakingStatus.textContent = 'Listening';
        visualizerOrb.classList.remove('active');
        soundWaves.classList.remove('active');
        frequencyBars.classList.remove('active');
        particles.classList.remove('active');
        orbIcon.className = 'fas fa-microphone orb-icon';
        
        // Return background waves to normal during listening
        document.querySelectorAll('.wave-layer').forEach((layer, index) => {
            layer.style.animationDuration = `${15 + index * 5}s`;
        });
    }
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    const notificationMessage = notification.querySelector('.notification-message');
    const notificationIcon = notification.querySelector('.notification-icon');
    
    // Set icon based on type
    if (type === 'success') {
        notificationIcon.className = 'notification-icon fas fa-check-circle';
    } else if (type === 'error') {
        notificationIcon.className = 'notification-icon fas fa-exclamation-circle';
    } else {
        notificationIcon.className = 'notification-icon fas fa-info-circle';
    }
    
    // Set message and show notification
    notificationMessage.textContent = message;
    notification.className = `notification ${type} show`;
    
    // Hide notification after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
    }, 5000);
}

// Initialize convai widget
async function initializeConvaiWidget() {
    try {
        const agentId = await getAgentId();
        const container = document.getElementById('convai-container');
        
        // Ensure container is empty
        if (container) {
            container.innerHTML = '';
            
            // Create widget element
            const widget = document.createElement('elevenlabs-convai');
            widget.setAttribute('agent-id', agentId);
            container.appendChild(widget);
            
            // Wait for the widget to load
            return new Promise(resolve => setTimeout(resolve, 1000));
        }
    } catch (error) {
        console.error('Error initializing Convai widget:', error);
    }
}

// Add this function to check for pending reminders
async function checkForPendingReminders() {
  if (!sessionId) return;
  
  try {
    const response = await fetch(`${API_URL}/api/check-reminders?sessionId=${sessionId}`);
    if (!response.ok) return;
    
    const data = await response.json();
    const { pendingReminders } = data;
    
    if (pendingReminders && pendingReminders.length > 0) {
      // Process each pending reminder
      for (const reminder of pendingReminders) {
        // Format a natural language response to the reminder
        const reminderMessage = `${getRandomReminderPrefix()} ${reminder.task}`;
        
        // Create a synthetic assistant message to represent the reminder
        const syntheticMessage = {
          role: "assistant",
          content: reminderMessage,
          isReminder: true
        };
        
        // Add to conversation history
        conversationHistory.push(syntheticMessage);
        
        // If you have a UI element to display reminders, update it here
        showNotification(`Reminder: ${reminder.task}`, 'reminder');
        
        // You might want to trigger speech synthesis to speak the reminder
        if (window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance(reminderMessage);
          window.speechSynthesis.speak(utterance);
        }
      }
    }
  } catch (error) {
    console.error('Error checking reminders:', error);
  }
}

// Get a random natural language prefix for the reminder
function getRandomReminderPrefix() {
  const prefixes = [
    "Beta, time's up!",
    "Beta, reminder:",
    "Don't forget to",
    "Beta, you asked me to remind you about",
    "Time to",
    "Just a reminder to",
    "Beta, it's time to"
  ];
  return prefixes[Math.floor(Math.random() * prefixes.length)];
}

// Start checking for reminders when conversation starts
function startReminderCheck() {
  // Clear any existing interval
  if (reminderCheckInterval) {
    clearInterval(reminderCheckInterval);
  }
  
  // Check for reminders every 1 second
  reminderCheckInterval = setInterval(checkForPendingReminders, 1000);
}

// Stop checking for reminders when conversation ends
function stopReminderCheck() {
  if (reminderCheckInterval) {
    clearInterval(reminderCheckInterval);
    reminderCheckInterval = null;
  }
}

// Add this function to start checking for delays
function startDelayCheck() {
  if (delayCheckInterval) {
    clearInterval(delayCheckInterval);
  }
  
  delayCheckInterval = setInterval(async () => {
    if (!sessionId) return;
    
    try {
      const response = await fetch(`${API_URL}/api/check-delay?sessionId=${sessionId}`);
      if (!response.ok) return;
      
      const data = await response.json();
      
      if (data.hasActiveDelay) {
        isWaitingForDelay = true;
        
        // Update UI to show waiting status
        updateWaitingStatus(data.remainingSeconds);
      } else if (isWaitingForDelay) {
        // We were waiting but now the delay is over
        isWaitingForDelay = false;
        
        // Update UI to show normal status
        updateWaitingStatus(0);
      }
    } catch (error) {
      console.error('Error checking for delays:', error);
    }
  }, 1000);
}

// Add this function to update UI based on waiting status
function updateWaitingStatus(remainingSeconds) {
  const speakingStatus = document.getElementById('speakingStatus');
  
  if (remainingSeconds > 0) {
    speakingStatus.textContent = `Waiting (${remainingSeconds}s)`;
    speakingStatus.style.color = '#ffa500'; // Orange for waiting
  } else {
    // Reset to normal
    speakingStatus.textContent = isWaitingForDelay ? 'Listening' : speakingStatus.textContent;
    speakingStatus.style.color = '';
  }
}

// Start conversation with ElevenLabs API
async function startConversation() {
    const startButton = document.getElementById('startButton');
    const endButton = document.getElementById('endButton');
    
    // Change button to loading state
    startButton.disabled = true;
    startButton.innerHTML = '<i class="fas fa-spinner spinner"></i><span>Connecting...</span>';
    
    try {
        // Reset reconnect attempts
        reconnectAttempts = 0;
        
        const hasPermission = await requestMicrophonePermission();
        if (!hasPermission) {
            showNotification('Microphone permission is required for the conversation.', 'error');
            startButton.innerHTML = '<i class="fas fa-play"></i><span>Start Conversation</span>';
            startButton.disabled = false;
            return;
        }
        
        // Initialize Convai widget
        await initializeConvaiWidget();

        // Get signed URL with userId
        const signedUrl = await getSignedUrl();
        
        // Start keep-alive pings for session
        startKeepAliveInterval();
        
        // Start checking for reminders
        startReminderCheck();
        
        // Start checking for delays
        startDelayCheck();
        
        // Clear conversation history
        conversationHistory = [];
        
        // Start conversation
        conversation = await Conversation.startSession({
            signedUrl: signedUrl,
            onConnect: () => {
                updateConnectionStatus(true);
                startButton.disabled = true;
                endButton.disabled = false;
                startButton.innerHTML = '<i class="fas fa-play"></i><span>Start Conversation</span>';
                showNotification('Connected successfully! You can start speaking now.', 'success');
                
                // Reset reconnect attempts on successful connection
                reconnectAttempts = 0;
            },
            onDisconnect: () => {
                console.log('WebSocket disconnected');
                
                // Don't update UI immediately, try to reconnect first
                if (endButton.disabled === false) {
                    // Only attempt reconnection if we haven't manually ended
                    attemptReconnection();
                } else {
                    updateConnectionStatus(false);
                    startButton.disabled = false;
                    endButton.disabled = true;
                }
            },
            onError: (error) => {
                console.error('Conversation error:', error);
                
                if (error.message && error.message.includes('WebSocket')) {
                    // Try to reconnect for WebSocket errors
                    attemptReconnection();
                } else {
                    showNotification('An error occurred during the conversation.', 'error');
                    startButton.disabled = false;
                    startButton.innerHTML = '<i class="fas fa-play"></i><span>Start Conversation</span>';
                }
            },
            onModeChange: (mode) => {
                updateSpeakingStatus(mode);
            },
            onMessage: async (message) => {
                // Track messages and store in memory
                if (message.role === 'assistant') {
                    // Check if the assistant's message contains delay instructions
                    const hasDelay = await processMessageForDelays(message.content);
                    
                    // Find the most recent user message
                    const lastUserMessage = conversationHistory.length > 0 ? 
                        conversationHistory[conversationHistory.length - 1].content : 
                        null;
                    
                    if (lastUserMessage) {
                        storeConversationMemory(lastUserMessage, message.content);
                    }
                    
                    // Add to conversation history
                    conversationHistory.push({ role: 'assistant', content: message.content });
                } else if (message.role === 'user') {
                    // Add user message to history
                    conversationHistory.push({ role: 'user', content: message.content });
                }
            }
        });
    } catch (error) {
        console.error('Error starting conversation:', error);
        showNotification('Failed to start conversation. Please try again.', 'error');
        startButton.disabled = false;
        startButton.innerHTML = '<i class="fas fa-play"></i><span>Start Conversation</span>';
        
        // Clear any intervals
        if (window.keepAliveInterval) {
            clearInterval(window.keepAliveInterval);
            window.keepAliveInterval = null;
        }
    }
}

// Attempt to reconnect after disconnect
async function attemptReconnection() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('Max reconnection attempts reached, giving up');
        showNotification('Connection lost. Please restart the conversation.', 'error');
        
        updateConnectionStatus(false);
        document.getElementById('startButton').disabled = false;
        document.getElementById('startButton').innerHTML = '<i class="fas fa-play"></i><span>Start Conversation</span>';
        document.getElementById('endButton').disabled = true;
        
        // Clear intervals
        if (window.keepAliveInterval) {
            clearInterval(window.keepAliveInterval);
            window.keepAliveInterval = null;
        }
        
        return;
    }
    
    reconnectAttempts++;
    console.log(`Attempting to reconnect (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    
    try {
        // Get a fresh signed URL
        const signedUrl = await getSignedUrl();
        
        // Clean up old conversation
        if (conversation) {
            try {
                await conversation.endSession();
            } catch (e) {
                console.error('Error ending old session:', e);
                // Continue anyway
            }
        }
        
        // Create new conversation
        conversation = await Conversation.startSession({
            signedUrl: signedUrl,
            onConnect: () => {
                console.log('Reconnection successful');
                updateConnectionStatus(true);
                document.getElementById('startButton').disabled = true;
                document.getElementById('endButton').disabled = false;
                showNotification('Reconnected successfully!', 'success');
                
                // Reset reconnect attempts
                reconnectAttempts = 0;
            },
            onDisconnect: () => {
                console.log('WebSocket disconnected after reconnection');
                // Try again after delay
                setTimeout(attemptReconnection, 2000);
            },
            onError: (error) => {
                console.error('Error after reconnection:', error);
                // Try to reconnect again after a delay
                setTimeout(attemptReconnection, 2000);
            },
            onModeChange: (mode) => {
                updateSpeakingStatus(mode);
            },
            onMessage: async (message) => {
                // Track messages and store in memory
                if (message.role === 'assistant') {
                    // Check if the assistant's message contains delay instructions
                    const hasDelay = await processMessageForDelays(message.content);
                    
                    // Find the most recent user message
                    const lastUserMessage = conversationHistory.length > 0 ? 
                        conversationHistory[conversationHistory.length - 1].content : 
                        null;
                    
                    if (lastUserMessage) {
                        storeConversationMemory(lastUserMessage, message.content);
                    }
                    
                    // Add to conversation history
                    conversationHistory.push({ role: 'assistant', content: message.content });
                } else if (message.role === 'user') {
                    // Add user message to history
                    conversationHistory.push({ role: 'user', content: message.content });
                }
            }
        });
    } catch (error) {
        console.error('Error during reconnection:', error);
        
        // Use exponential backoff for reconnection attempts
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
        setTimeout(attemptReconnection, delay);
    }
}

// End conversation
async function endConversation() {
    const startButton = document.getElementById('startButton');
    const endButton = document.getElementById('endButton');
    
    endButton.disabled = true;
    endButton.innerHTML = '<i class="fas fa-spinner spinner"></i><span>Ending...</span>';
    
    try {
        // Clear keep-alive interval
        if (window.keepAliveInterval) {
            clearInterval(window.keepAliveInterval);
            window.keepAliveInterval = null;
        }
        
        // End session on server
        if (sessionId) {
            try {
                await fetch(`${API_URL}/api/end-session`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ sessionId })
                });
            } catch (e) {
                console.error('Error ending session on server:', e);
                // Continue anyway
            }
        }
        
        // End the conversation
        if (conversation) {
            try {
                await conversation.endSession();
            } catch (e) {
                console.error('Error ending conversation:', e);
                // Continue anyway
            }
            conversation = null;
        }
        
        // Reset conversation state
        sessionId = null;
        conversationHistory = [];
        reconnectAttempts = 0;
        
        // Update UI
        updateConnectionStatus(false);
        startButton.disabled = false;
        endButton.disabled = true;
        endButton.innerHTML = '<i class="fas fa-stop"></i><span>End</span>';
        showNotification('Conversation ended successfully.', 'info');
        
        // Clear Convai widget
        const container = document.getElementById('convai-container');
        if (container) {
            container.innerHTML = '';
        }
        
        // Stop reminder checks
        stopReminderCheck();
        
        // Stop delay checks
        if (delayCheckInterval) {
            clearInterval(delayCheckInterval);
            delayCheckInterval = null;
        }
    } catch (error) {
        console.error('Error ending conversation:', error);
        endButton.innerHTML = '<i class="fas fa-stop"></i><span>End</span>';
        endButton.disabled = false;
        showNotification('Error ending conversation.', 'error');
    }
}

// Global error handler
window.addEventListener('error', function(event) {
    console.error('Global error:', event.error);
    showNotification('An unexpected error occurred.', 'error');
});

// Add this function to your app.js file and call it in the DOMContentLoaded event
function ensureWavesAreVisible() {
    // Check if waves container exists
    let wavesContainer = document.querySelector('.background-waves');
    
    // If it doesn't exist, create it
    if (!wavesContainer) {
        wavesContainer = document.createElement('div');
        wavesContainer.className = 'background-waves';
        document.body.prepend(wavesContainer);
    }
    
    // Clear existing waves
    wavesContainer.innerHTML = '';
    
    // Create new wave layers
    for (let i = 0; i < 3; i++) {
        const waveLayer = document.createElement('div');
        waveLayer.className = 'wave-layer';
        waveLayer.style.top = `${i * 10}%`;
        waveLayer.style.opacity = (0.8 - (i * 0.2)).toString();
        waveLayer.style.animationDuration = `${15 + (i * 5)}s`;
        if (i === 1) waveLayer.style.animationDirection = 'reverse';
        if (i === 2) waveLayer.style.animationDelay = '2s';
        wavesContainer.appendChild(waveLayer);
    }
    
    // Ensure the waves container is visible
    wavesContainer.style.display = 'block';
    wavesContainer.style.opacity = '0.4';
}

// Update your processMessage function or similar to detect timer requests
function processUserMessage(message) {
  // Check if the message contains a timer/reminder request
  const timerPatterns = [
    /remind me in (\d+) (second|seconds|minute|minutes|hour|hours)/i,
    /(\d+) (second|seconds|minute|minutes|hour|hours) ke baad yaad dila dena/i,
    /(\d+) (second|seconds|minute|minutes|hour|hours) baad .* yaad dila dena/i
  ];
  
  let containsTimerRequest = false;
  for (const pattern of timerPatterns) {
    if (pattern.test(message)) {
      containsTimerRequest = true;
      break;
    }
  }
  
  // If it's a timer request, we might want to handle it specially
  if (containsTimerRequest) {
    console.log('Timer request detected in message:', message);
    // You might add special handling here
  }
  
  // Return the message for normal processing
  return message;
}

// Add a function to process messages for delays
async function processMessageForDelays(message) {
  if (!sessionId) return false;
  
  try {
    const response = await fetch(`${API_URL}/api/process-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId,
        message
      })
    });
    
    if (!response.ok) return false;
    
    const data = await response.json();
    return data.hasDelay;
  } catch (error) {
    console.error('Error processing message for delays:', error);
    return false;
  }
}

// You'd call this when processing user input
// For example, in your onMessage handler or similar