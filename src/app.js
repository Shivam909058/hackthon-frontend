// --- src/app.js ---
import { Conversation } from '@11labs/client';

const API_URL = process.env.REACT_APP_API_URL || 'https://hackthon-backend-zeta.vercel.app';

let conversation = null;
let currentTheme = 'light';
let sessionId = null;
let keepAliveInterval = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

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
    
    // Clean up on page unload
    window.addEventListener('beforeunload', cleanupOnUnload);
});

// Clean up resources when page is closed
function cleanupOnUnload() {
    if (conversation) {
        try {
            // Try to end the conversation gracefully
            conversation.endSession();
        } catch (error) {
            console.error('Error ending conversation on unload:', error);
        }
    }
    
    if (sessionId) {
        // Notify the server that the session is ending
        try {
            fetch(`${API_URL}/api/end-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ sessionId }),
                // Use keepalive to ensure the request completes even if page is unloading
                keepalive: true
            });
        } catch (error) {
            console.error('Error ending session on unload:', error);
        }
    }
    
    // Clear any intervals
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
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
        // Include existing session ID if we have one
        let url = `${API_URL}/api/signed-url`;
        if (sessionId) {
            url += `?sessionId=${sessionId}`;
        }
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to get signed URL');
        const data = await response.json();
        
        // Save the session ID for future requests
        if (data.sessionId) {
            sessionId = data.sessionId;
        }
        
        return data.signedUrl;
    } catch (error) {
        console.error('Error getting signed URL:', error);
        throw error;
    }
}

// Send keep-alive ping to server
async function sendKeepAlive() {
    if (!sessionId) return;
    
    try {
        await fetch(`${API_URL}/api/keep-alive`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId })
        });
    } catch (error) {
        console.error('Error sending keep-alive:', error);
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

// Setup the Convai widget
async function setupConvaiWidget() {
    try {
        const agentId = await getAgentId();
        const container = document.getElementById('convai-container');
        
        // Clear any existing widgets
        container.innerHTML = '';
        
        // Create the new widget
        const widget = document.createElement('elevenlabs-convai');
        widget.setAttribute('agent-id', agentId);
        
        // Add to container
        container.appendChild(widget);
        
        // Give time for the widget to initialize
        return new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
        console.error('Error setting up Convai widget:', error);
        throw error;
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
        // Reset reconnect attempts counter
        reconnectAttempts = 0;
        
        const hasPermission = await requestMicrophonePermission();
        if (!hasPermission) {
            showNotification('Microphone permission is required for the conversation.', 'error');
            startButton.innerHTML = '<i class="fas fa-play"></i><span>Start Conversation</span>';
            startButton.disabled = false;
            return;
        }
        
        // Set up the Convai widget
        await setupConvaiWidget();

        // Get signed URL
        const signedUrl = await getSignedUrl();
        
        // Start keep-alive pings to server
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
        }
        keepAliveInterval = setInterval(sendKeepAlive, 10000); // Every 10 seconds
        
        // Start the conversation
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
                if (endButton.disabled === false) { // Only try to reconnect if we haven't manually ended
                    attemptReconnection();
                } else {
                    // We manually ended, so update UI
                    updateConnectionStatus(false);
                    startButton.disabled = false;
                    endButton.disabled = true;
                }
            },
            onError: (error) => {
                console.error('Conversation error:', error);
                
                if (error.message && error.message.includes('WebSocket')) {
                    // WebSocket specific errors, try to reconnect
                    attemptReconnection();
                } else {
                    showNotification('An error occurred during the conversation.', 'error');
                    startButton.disabled = false;
                    startButton.innerHTML = '<i class="fas fa-play"></i><span>Start Conversation</span>';
                }
            },
            onModeChange: (mode) => {
                updateSpeakingStatus(mode);
            }
        });
    } catch (error) {
        console.error('Error starting conversation:', error);
        showNotification('Failed to start conversation. Please try again.', 'error');
        startButton.disabled = false;
        startButton.innerHTML = '<i class="fas fa-play"></i><span>Start Conversation</span>';
        
        // Clear any intervals
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
        }
    }
}

// Attempt to reconnect after disconnection
async function attemptReconnection() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('Max reconnection attempts reached, giving up');
        showNotification('Connection lost. Please restart the conversation.', 'error');
        
        updateConnectionStatus(false);
        document.getElementById('startButton').disabled = false;
        document.getElementById('startButton').innerHTML = '<i class="fas fa-play"></i><span>Start Conversation</span>';
        document.getElementById('endButton').disabled = true;
        
        // Clear any intervals
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
        }
        
        return;
    }
    
    reconnectAttempts++;
    console.log(`Attempting to reconnect (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    
    try {
        // Get a fresh signed URL
        const signedUrl = await getSignedUrl();
        
        // Clean up old conversation if it exists
        if (conversation) {
            try {
                await conversation.endSession();
            } catch (e) {
                console.log('Error ending old session:', e);
                // Continue anyway
            }
        }
        
        // Create a new conversation
        conversation = await Conversation.startSession({
            signedUrl: signedUrl,
            onConnect: () => {
                console.log('Reconnection successful');
                updateConnectionStatus(true);
                document.getElementById('startButton').disabled = true;
                document.getElementById('endButton').disabled = false;
                showNotification('Reconnected successfully!', 'success');
                
                // Reset reconnect attempts on successful connection
                reconnectAttempts = 0;
            },
            onDisconnect: () => {
                console.log('WebSocket disconnected after reconnection');
                // Try to reconnect again
                setTimeout(attemptReconnection, 2000);
            },
            onError: (error) => {
                console.error('Error after reconnection:', error);
                // Try to reconnect again after a delay
                setTimeout(attemptReconnection, 2000);
            },
            onModeChange: (mode) => {
                updateSpeakingStatus(mode);
            }
        });
    } catch (error) {
        console.error('Error during reconnection:', error);
        
        // Exponential backoff
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
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
        }
        
        // Notify server to end session
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
                console.error('Error notifying server of session end:', e);
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
        
        // Reset state
        sessionId = null;
        reconnectAttempts = 0;
        
        // Update UI
        updateConnectionStatus(false);
        startButton.disabled = false;
        endButton.disabled = true;
        endButton.innerHTML = '<i class="fas fa-stop"></i><span>End</span>';
        showNotification('Conversation ended successfully.', 'info');
        
        // Clean up the Convai widget
        const container = document.getElementById('convai-container');
        container.innerHTML = '';
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