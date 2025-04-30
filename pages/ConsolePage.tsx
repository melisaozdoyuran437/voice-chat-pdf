import React, { useEffect, useRef, useCallback, useState } from 'react';
import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { instructions } from '../constants/conversation_config.js';
import { slides } from '../constants/demo_slides.js';
import EmailSubscription from '../components/EmailSubscription';

const LOCAL_RELAY_SERVER_URL: string = process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';

/**
 * Type for event logs
 */
interface RealtimeEvent {
  time: string;
  source: 'client' | 'server';
  count?: number;
  event: { [key: string]: any };
}

interface Props {
  companyName: string;
}

export default function ConsolePage({ companyName }: Props) {
  const [apiKey, setApiKey] = useState<string>('');
  const clientRef = useRef<RealtimeClient | null>(null);

  // States
  const [items, setItems] = useState<ItemType[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [sessionUUID, setSessionUUID] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [displayImage, setDisplayImage] = useState('/default.png');
  const [showDefault, setShowDefault] = useState(true);
  const [agentEmotion, setAgentEmotion] = useState('neutral');
  const [showIntro, setShowIntro] = useState(true);

  // References
  const wavRecorderRef = useRef<WavRecorder>(new WavRecorder({ sampleRate: 24000 }));
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(new WavStreamPlayer({ sampleRate: 24000 }));
  const clientCanvasRef = useRef<HTMLCanvasElement>(null);
  const serverCanvasRef = useRef<HTMLCanvasElement>(null);
  const startTimeRef = useRef<string>(new Date().toISOString());

  const [isEmailPopupOpen, setIsEmailPopupOpen] = useState(false);
  
  // Demo slides
  const [currentSlideIndex, setCurrentSlideIndex] = useState(-1); // Start before the first slide
  const currentSlideIndexRef = useRef(currentSlideIndex);
  const [isInDemoMode, setIsInDemoMode] = useState(false); // To control demo flow
  const isInDemoModeRef = useRef(false);
  const [isDemoFinished, setIsDemoFinished] = useState(false);
  const isDemoFinishedRef = useRef(false);

  useEffect(() => { isInDemoModeRef.current = isInDemoMode; }, [isInDemoMode]);
  useEffect(() => { isDemoFinishedRef.current = isDemoFinished; }, [isDemoFinished]);
  useEffect(() => { 
    currentSlideIndexRef.current = currentSlideIndex; 
  }, [currentSlideIndex]);
  
  // Ref to store the timeout ID for the delay
  const advanceSlideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to track the previous state of isAgentSpeaking
  const wasAgentSpeakingRef = useRef(false);
  const triggerSentRef = useRef(false);


  // Initialize API key from localStorage
  useEffect(() => {
    const storedApiKey = localStorage.getItem('tmp::voice_api_key') || '';
    setApiKey(storedApiKey);

    if (!LOCAL_RELAY_SERVER_URL && !storedApiKey) {
      const newApiKey = prompt('OpenAI API Key') || '';
      if (newApiKey) {
        localStorage.setItem('tmp::voice_api_key', newApiKey);
        setApiKey(newApiKey);
      }
    }
  }, []);

  // Initialize RealtimeClient when apiKey is available
  useEffect(() => {
    if (apiKey || LOCAL_RELAY_SERVER_URL) {
      clientRef.current = new RealtimeClient(
        LOCAL_RELAY_SERVER_URL
          ? { url: LOCAL_RELAY_SERVER_URL }
          : {
              url: 'wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview',
              apiKey: apiKey,
              dangerouslyAllowAPIKeyInBrowser: true,
              debug: true,
            }
      );
    }
  }, [apiKey]);

  useEffect(() => {
    const client = clientRef.current;
    const currentTimeoutId = advanceSlideTimeoutRef.current;
    // Clear if demo stopped OR agent started speaking again
    const shouldClearTimer = !isInDemoMode || isDemoFinished || isAgentSpeaking;

    if (shouldClearTimer) { // Clear timer AND reset the trigger flag
        if (currentTimeoutId) {
            clearTimeout(currentTimeoutId);
            advanceSlideTimeoutRef.current = null;
        }
        // *** Reset the trigger flag whenever the agent speaks or demo ends ***
        if (triggerSentRef.current) {
             triggerSentRef.current = false;
        }
    }

    // Determine if conditions require starting a NEW timer ---
    const agentJustStopped = wasAgentSpeakingRef.current && !isAgentSpeaking;
    const shouldStartTimer =
        isInDemoMode &&
        !isDemoFinished &&
        agentJustStopped &&
        !advanceSlideTimeoutRef.current; // Check if ref is null (no timer active)

    if (shouldStartTimer) {
        const newTimerId = setTimeout(() => {
            const stillInDemo = isInDemoModeRef.current;
            const stillNotFinished = !isDemoFinishedRef.current;
            const stillNotSpeaking = !isAgentSpeaking;
            if (stillInDemo && stillNotFinished && stillNotSpeaking && !triggerSentRef.current) {
                if (client && client.isConnected()) {
                    client.sendUserMessageContent([{ type: "input_text", text: "Proceed to the next slide." }]);
                    triggerSentRef.current = true;
                }
            }

            if (advanceSlideTimeoutRef.current === newTimerId) {
                advanceSlideTimeoutRef.current = null;
            }

        }, 3500)

        advanceSlideTimeoutRef.current = newTimerId;
    }

    // Update the 'previous' state ref for the next run ---
    wasAgentSpeakingRef.current = isAgentSpeaking;

    if (currentSlideIndex >= slides.length) {
      setIsDemoFinished(true);
      setIsInDemoMode(false);
    }

    return () => {
        if (currentTimeoutId) {
            clearTimeout(currentTimeoutId);
        }
    };
}, [isAgentSpeaking, isInDemoMode, isDemoFinished, clientRef]);

  // Connect to conversation
  const connectConversation = useCallback(async () => {
    const client = clientRef.current;
    if (!client) throw new Error('RealtimeClient is not initialized');
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    // Connect to microphone
    await wavRecorder.begin();

    // Connect to audio output
    await wavStreamPlayer.connect();

    // Update to open mic connection
    client.updateSession({
      model: 'gpt-4o-mini-realtime-preview-2024-12-17',
      voice: 'alloy',
      modalities: ['text', 'audio'],
      instructions: instructions,
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      input_audio_noise_reduction: {
        type: 'far_field',
      },
      input_audio_transcription: {
        model: 'whisper-1',
        language: 'en',
      },
      turn_detection: {
        type: 'semantic_vad',
        eagerness: 'low',
        create_response: true, // only in conversation mode
        interrupt_response: true, // only in conversation mode
      },
      tools: [
        {
          "type": "function",
          "name": "get_demo_slide",
          "description": "Retrieves the script for the next slide in the demo presentation sequence. If the USER responds affirmatively to the demo offer (e.g., using phrases like 'yes', 'sure', 'okay', 'sounds good', 'that sounds great', 'alright', 'start demo', 'show me the demo'), call this tool immediately. Call this tool when you need to get the script for the slides when giving the demo.",
          "parameters": {
              "type": "object",
              "properties": {},
              "required": []
          }
        },
        {
          "type": "function",
          "name": "get_context",
          "description": "Retrieves context for company specific questions. Call this tool when the user has asked a company specific question and you do need more context to answer it.",
          "parameters": {
              "type": "object",
              "properties": {
                "query": {"type": "string"}
              },
              "required": ["query"]
          }
        },
      ],
      temperature: 0.8,
    });

    // Initialize session with backend
    const response = await fetch('http://127.0.0.1:8000/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: "revola",    
        name: 'kyle',
        email: 'kylez56789@gmail.com'
      }),
    });
    
    if (!response.ok) {
      const err = await response.json();
      console.error('Init error:', err);
      return;
    }
    
    const data = await response.json();
    console.log('API response:', data);
    setSessionUUID(data.uuid);

    const intro = `IMPORTANT: YOU ARE TO SAY EXACTLY THIS 'Hi there! I’m Reva — your AI sales engagement specialist, built by the team at Revola.
        Let me show you how I can turn more of your website visitors into high-converting leads — without adding pressure or draining your sales team. You may input your email in the top right anytime during the meeting if you want to be connected to the sales team. How are you doing today?`;

    // Connect to realtime API
    try {
      await client.connect();
      console.log('RealtimeClient connected successfully');
    } catch (error) {
      console.error('Failed to connect RealtimeClient:', error);
      throw new Error('RealtimeClient connection failed');
    }

    client.sendUserMessageContent([
      {
        type: `input_text`,
        text: intro,
      },
    ]);

    // Set state variables
    startTimeRef.current = new Date().toISOString();
    setIsConnected(true);
    setRealtimeEvents([]);
    setItems(client.conversation.getItems());
    
    if (client.isConnected() && isRecording) {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
    
    // Simulate agent emotions for demo
    const emotionInterval = setInterval(() => {
      if (isAgentSpeaking) {
        const emotions = ['neutral', 'happy', 'thinking', 'excited'];
        const randomEmotion = emotions[Math.floor(Math.random() * emotions.length)];
        setAgentEmotion(randomEmotion);
      } else {
        setAgentEmotion('neutral');
      }
    }, 3000);
    
    return () => clearInterval(emotionInterval);
  }, [isRecording]);

  // Disconnect and reset conversation state
  const disconnectConversation = useCallback(async () => {
    setIsConnected(false);
    setRealtimeEvents([]);
    setItems([]);
    setDisplayImage('/default.png');
    setShowDefault(true);
    setShowIntro(true);
    setAgentEmotion('neutral');
    setCurrentSlideIndex(-1);
    setIsDemoFinished(false);

    const client = clientRef.current;
    if (!client) throw new Error('RealtimeClient is not initialized');
    client.removeTool("get_context");
    client.removeTool("get_demo_slide");
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();
  }, []);

  // Start recording audio
  const startRecording = async () => {
    console.log('Starting recording');
    setIsRecording(true);
    if (!isConnected) {
      console.error('Session not connected: please connect first');
      return;
    }
    const client = clientRef.current;
    if (!client) throw new Error('RealtimeClient is not initialized');
    const wavRecorder = wavRecorderRef.current;

    await wavRecorder.record((data) => client.appendInputAudio(data.mono));
  };

  // Stop recording audio
  const stopRecording = async () => {
    console.log('Stopping recording');
    setIsRecording(false);
    if (!isConnected) {
      console.error('Session not connected: please connect first');
      return;
    }
    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.pause();
  };

  // Toggle recording state
  const handleRecordingToggle = () => {
    if (isConnected) {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    } else {
      setIsRecording((prevIsRecording) => !prevIsRecording);
    }
  };

  // Handle text input changes
  const handleTextInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTextInput(event.target.value);
  };

  // Submit text input
  const handleTextInputSubmit = async () => {
    if (textInput.trim() === '' || !isConnected) return;

    const client = clientRef.current;
    if (!client) throw new Error('RealtimeClient is not initialized');

    // Send the text input as a user message
    client.sendUserMessageContent([
      {
        type: 'input_text',
        text: textInput,
      },
    ]);
    // Clear the text input field
    setTextInput('');
  };

  // Set up event handlers for RealtimeClient
  useEffect(() => {
    const client = clientRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;
    if (!client || !sessionUUID) return;
  
    console.log('[useEffect] 🏷 registering handlers');
  
    const onTranscript = async (evt: any) => {
      if (evt.event.type !== 'conversation.item.input_audio_transcription.completed')
        return;
      console.log('[onTranscript] transcript:', evt.event.transcript);
    };
  
    const onConvUpdate = async ({ item, delta }: any) => {
      if (delta?.audio) {
        // Add delay before adding audio
        await new Promise((r) => setTimeout(r, 750));
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
    
      if (item.status === 'completed' && item.formatted.audio?.length) {
        WavRecorder.decode(item.formatted.audio, 24000, 24000).then((wav) => {
          item.formatted.file = wav;
        });
      }
    
      setItems(client.conversation.getItems());
    };
    
    client.addTool({
      name: 'get_demo_slide',
      description: "Retrieves the script for the next slide in the demo presentation sequence. If the USER responds affirmatively to the demo offer (e.g., using phrases like 'yes', 'sure', 'okay', 'sounds good', 'that sounds great', 'alright', 'start demo', 'show me the demo'), call this tool immediately. Call this tool when you need to get the script for the slides when giving the demo.",
      parameters: {
        type: 'object',
        properties: {}, // No parameters needed from the agent for this tool
        required: [],
      },
    },
      // The async function simulates fetching the next slide's script
      async () => {
        console.log("Called get_demo_slide tool");
        if (currentSlideIndex == -1) {
          setIsInDemoMode(true);
        }
        let currentSlide = currentSlideIndexRef.current
        const nextIndex = currentSlide + 1;
        if (nextIndex < slides.length) {
          // Update the persistent state to the new index
          setCurrentSlideIndex(nextIndex);
    
          // Get the script for the new current slide
          const slide = slides[nextIndex];
          const script = slide.script;
          console.log(`Tool: Returning script for slide ${nextIndex + 1}: "${script.substring(0, 30)}..."`);
    
          // Return the script for the agent to say
          return {
            script: script,
          };
        } else {
          // Reached the end of the presentation
          setCurrentSlideIndex(10000);
          console.log("END OF PRESENTATION");
          setIsInDemoMode(false);
          setIsDemoFinished(true);
          return {
            script: "And that wraps up the main demo!",
          };
        }
    });
    client.addTool({
      name: 'get_context',
      description: 'Retrieves context for company specific questions. Call this tool when the user has asked a company specific question and you do need more context to answer it.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: "the user's question or query"
          }
        }, // No parameters needed from the agent for this tool
        required: ['query'],
      },
    },
      // The async function simulates fetching the next slide's script
      async ({query}: { [key: string]: any}) => {
        console.log("Using get-context tool");
        let data: { message: string; image: string };
        try {
          const res = await fetch(`http://127.0.0.1:8000/get-context`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uuid: sessionUUID, query: query}),
          });
          if (!res.ok) {
            console.error("Backend error:", await res.text());
            return;
          }
          data = await res.json();
        } catch (err) {
          console.error("Fetch failed:", err);
          return;
        }
        console.log("Context Retreived");
        console.log(data);
          // Update image if available
        if (data.image && data.image.length > 0) {
          const imagePath = data.image.replace(/^public/, '')
          console.log(imagePath)
          setDisplayImage(imagePath);
          setShowDefault(false);
        }
        return data.message;

        // const prompt = `
        // <user_query> ${query} <user_query>
        // <context>${data.message}<context>`;
        // return prompt;
    });
    client.on('realtime.event', onTranscript)
    client.on('conversation.updated', onConvUpdate)
    client.on('conversation.interrupted', async () => {
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }
    });
  
    // seed the UI
    setItems(client.conversation.getItems())
  
    return () => {
      console.log('[useEffect] 🔥 tearing down handlers')
      client.off('realtime.event', onTranscript)
      client.off('conversation.updated', onConvUpdate)
    }
  }, [sessionUUID])

  // Set up render loops for visualization canvas
  useEffect(() => {
    if (!isConnected) return;

    let isLoaded = true;

    const wavRecorder = wavRecorderRef.current;
    const clientCanvas = clientCanvasRef.current;
    let clientCtx: CanvasRenderingContext2D | null = null;

    const wavStreamPlayer = wavStreamPlayerRef.current;
    const serverCanvas = serverCanvasRef.current;
    let serverCtx: CanvasRenderingContext2D | null = null;

    const render = () => {
      if (isLoaded) {
        // User audio visualization - Modified to be more professional looking
        if (clientCanvas) {
          if (!clientCanvas.width || !clientCanvas.height) {
            clientCanvas.width = clientCanvas.offsetWidth;
            clientCanvas.height = clientCanvas.offsetHeight;
          }
          clientCtx = clientCtx || clientCanvas.getContext('2d');
          if (clientCtx) {
            clientCtx.clearRect(0, 0, clientCanvas.width, clientCanvas.height);
            const result = wavRecorder.recording
              ? wavRecorder.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            const maxAmplitude = Math.max(...Array.from(result.values));
            setIsUserSpeaking(maxAmplitude > 0.4);
            
            // Custom sleek visualization
            const barWidth = 2;
            const barSpacing = 1;
            const barCount = Math.min(40, Math.floor(clientCanvas.width / (barWidth + barSpacing)));
            const step = Math.ceil(result.values.length / barCount);
            
            clientCtx.fillStyle = 'rgba(183, 82, 255, 0.2)';
            clientCtx.fillRect(0, 0, clientCanvas.width, clientCanvas.height);
            
            for (let i = 0; i < barCount; i++) {
              const index = i * step;
              const value = result.values[index] || 0;
              const height = Math.max(2, value * clientCanvas.height * 0.7);
              const x = i * (barWidth + barSpacing) + (clientCanvas.width - barCount * (barWidth + barSpacing)) / 2;
              const y = (clientCanvas.height - height) / 2;
              
              const gradient = clientCtx.createLinearGradient(x, y, x, y + height);
              gradient.addColorStop(0, 'rgba(183, 82, 255, 0.7)');
              gradient.addColorStop(1, 'rgba(129, 77, 220, 0.9)');
              
              clientCtx.fillStyle = gradient;
              clientCtx.fillRect(x, y, barWidth, height);
            }
            
            // Add center line
            clientCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            clientCtx.lineWidth = 1;
            clientCtx.beginPath();
            clientCtx.moveTo(0, clientCanvas.height / 2);
            clientCtx.lineTo(clientCanvas.width, clientCanvas.height / 2);
            clientCtx.stroke();
          }
        }
        
        // Agent audio visualization - Similar sleek style
        if (serverCanvas) {
          if (!serverCanvas.width || !serverCanvas.height) {
            serverCanvas.width = serverCanvas.offsetWidth;
            serverCanvas.height = serverCanvas.offsetHeight;
          }
          serverCtx = serverCtx || serverCanvas.getContext('2d');
          if (serverCtx) {
            serverCtx.clearRect(0, 0, serverCanvas.width, serverCanvas.height);
            const result = wavStreamPlayer.analyser
              ? wavStreamPlayer.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            const maxAmplitude = Math.max(...Array.from(result.values));
            setIsAgentSpeaking(maxAmplitude > 0.3);
            
            // Mini sleek visualization
            const barWidth = 2;
            const barSpacing = 1;
            const barCount = Math.min(20, Math.floor(serverCanvas.width / (barWidth + barSpacing)));
            const step = Math.ceil(result.values.length / barCount);
            
            for (let i = 0; i < barCount; i++) {
              const index = i * step;
              const value = result.values[index] || 0;
              const height = Math.max(2, value * serverCanvas.height * 0.8);
              const x = i * (barWidth + barSpacing) + (serverCanvas.width - barCount * (barWidth + barSpacing)) / 2;
              const y = (serverCanvas.height - height) / 2;
              
              const gradient = serverCtx.createLinearGradient(x, y, x, y + height);
              gradient.addColorStop(0, 'rgba(183, 82, 255, 0.7)');
              gradient.addColorStop(1, 'rgba(129, 77, 220, 0.9)');
              
              serverCtx.fillStyle = gradient;
              serverCtx.fillRect(x, y, barWidth, height);
            }
          }
        }
        window.requestAnimationFrame(render);
      }
    };
    render();

    return () => {
      isLoaded = false;
    };
  }, [isConnected]);

  // Animation frames for digital particles backdrop effect
  useEffect(() => {
    if (!isConnected) return;
    
    const particleCanvas = document.getElementById('particle-canvas') as HTMLCanvasElement;
    if (!particleCanvas) return;
    
    const ctx = particleCanvas.getContext('2d');
    if (!ctx) return;
    
    particleCanvas.width = window.innerWidth;
    particleCanvas.height = window.innerHeight;
    
    const particles: any[] = [];
    const particleCount = 50;
    
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * particleCanvas.width,
        y: Math.random() * particleCanvas.height,
        size: Math.random() * 2 + 1,
        speedX: (Math.random() - 0.5) * 0.5,
        speedY: (Math.random() - 0.5) * 0.5,
        opacity: Math.random() * 0.5 + 0.2
      });
    }
    
    const connections: any[] = [];
    const animate = () => {
      ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
      
      // Update and draw particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        
        p.x += p.speedX;
        p.y += p.speedY;
        
        if (p.x < 0 || p.x > particleCanvas.width) p.speedX *= -1;
        if (p.y < 0 || p.y > particleCanvas.height) p.speedY *= -1;
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(183, 82, 255, ${p.opacity})`;
        ctx.fill();
        
        // Find connections
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < 100) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(183, 82, 255, ${0.1 * (1 - distance/100)})`;
            ctx.stroke();
          }
        }
      }
      
      requestAnimationFrame(animate);
    };
    
    animate();
    
    // Handle resize
    const handleResize = () => {
      particleCanvas.width = window.innerWidth;
      particleCanvas.height = window.innerHeight;
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isConnected]);

  // Function to determine facial expression class
  const getFacialExpressionClass = () => {
    if (isAgentSpeaking) {
      return 'agent-speaking';
    }
    return agentEmotion;
  };
  return (
    <div
      data-component="ConsolePage"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0B0B12',
        backgroundImage: 'radial-gradient(circle at 30% 30%, #251f3a 0%, transparent 70%)',
        minHeight: '100vh',
        overflow: 'hidden',
        margin: 0,
        padding: 0,
        position: 'relative',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif',
      }}
    >
      {/* Subtle Particle Background */}
      <canvas
        id="particle-canvas"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 0,
          opacity: 0.5,
        }}
      />
      
      {/* Animated Gradient Background */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, rgba(30, 30, 50, 0.5) 0%, rgba(10, 10, 20, 0.7) 100%)',
          backgroundSize: '400% 400%',
          zIndex: -1,
          animation: 'gradient-shift 20s ease infinite',
        }}
      />
  
      {/* Logo - Simplified and More Professional */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          zIndex: 5,
        }}
      >
        <img
          src="icon.png"
          alt="Revola"
          style={{
            width: '36px',
            height: '36px',
            filter: 'drop-shadow(0 0 8px rgba(183, 82, 255, 0.4))',
          }}
        />
        <span style={{color: '#ffffff', fontSize: '20px', fontWeight: '700',}}>revola</span>
       
      </div>
     
          
      {/* Connect Button or Main Content */}
      {!isConnected ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '36px',
            position: 'relative',
            zIndex: 1,
            maxWidth: '800px',
            textAlign: 'center',
            padding: '0 24px',
          }}
        >
          {/* Revola Agent Preview - Modernized */}
          <div
            style={{
              width: '200px',
              height: '200px',
              borderRadius: '50%',
              overflow: 'hidden',
              border: '2px solid rgba(183, 82, 255, 0.4)',
              boxShadow: '0 0 40px rgba(183, 82, 255, 0.2)',
              position: 'relative',
              marginTop: '40px',
            }}
          >
            <img
              src="/revola-agent.png"
              alt="Reva"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: '0',
                left: '0',
                right: '0',
                height: '40%',
                background: 'linear-gradient(to top, rgba(11, 11, 18, 0.7), transparent)',
              }}
            />
          </div>
          
          <div>
            <h1
              style={{
                fontSize: '2.5rem',
                fontWeight: '700',
                color: '#ffffff',
                marginBottom: '16px',
              }}
            >
              Meet Reva
            </h1>
            <p
              style={{
                color: '#B0B0C0',
                lineHeight: '1.7',
                marginBottom: '24px',
                fontSize: '17px',
                maxWidth: '600px',
              }}
            >
              Your AI sales assistant that combines voice technology with visual demonstrations
              to showcase products effectively. Engage customers with natural conversation and
              interactive product presentations.
            </p>
          </div>
          
          <button
            onClick={connectConversation}
            style={{
              padding: '16px 40px',
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(135deg, #B752FF, #8349FF)',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '17px',
              fontWeight: '600',
              letterSpacing: '0.5px',
              transition: 'all 0.3s ease',
              boxShadow: '0 8px 20px rgba(183, 82, 255, 0.3)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            Start Demo
          </button>
          
          {/* Key Features - Simplified and Cleaner */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '40px',
              marginTop: '10px',
              flexWrap: 'wrap',
            }}
          >
            {[
              { icon: "🎤", label: "Voice Enabled" },
              { icon: "💡", label: "Smart Responses" },
              { icon: "⚙️", label: "Customizable" }
            ].map((item, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(183, 82, 255, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ fontSize: '16px' }}>{item.icon}</span>
                </div>
                <span style={{ color: '#B0B0C0', fontSize: '15px' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // Main Layout when connected
        <>
         <EmailSubscription />
       
        <div style={{ 
          width: '94%',
          // maxWidth: '1400px', 
          height: '88vh', 
          display: 'flex', 
          position: 'relative',
          zIndex: 1, 
          marginTop: '70px',
          opacity: 1, 
        }}>
          
          {/* Main Display Area (Product Demo) */}
          <div
            style={{
              flex: '1',
              backgroundColor: 'rgba(16, 16, 24, 0.65)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderRadius: '20px',
              marginRight: '24px',
              padding: '24px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
              border: isAgentSpeaking 
                ? '1px solid rgba(183, 82, 255, 0.4)' 
                : '1px solid rgba(255, 255, 255, 0.08)',
              transition: 'all 0.3s ease',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Subtle grid background */}
            <div
              style={{
                position: 'absolute',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                backgroundImage: 'linear-gradient(rgba(183, 82, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(183, 82, 255, 0.03) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
                pointerEvents: 'none',
                opacity: 0.2,
                zIndex: 1,
              }}
            />
  
            {/* Demo Content Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
                position: 'relative',
                zIndex: 2,
              }}
            >
             
              
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  backgroundColor: 'rgba(16, 16, 24, 0.6)',
                  border: '1px solid rgba(183, 82, 255, 0.2)',
                }}
              >
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: isConnected ? '#50e3c2' : '#ff4d4d',
                    boxShadow: isConnected ? '0 0 8px rgba(80, 227, 194, 0.5)' : 'none',
                  }}
                />
                <span style={{ color: '#B0B0C0', fontSize: '13px' }}>
                  {isConnected ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
  
            {/* Main Demo Content Display */}
      
          <div
            style={{
              flex: 1,
              height: 'calc(100% - 60px)',
              position: 'relative',
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '18px',
              overflow: 'hidden',
              backgroundColor: 'rgba(11, 11, 18, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            
            }}
          >
            <img 
              src={isInDemoMode ? slides[currentSlideIndex].imagePath : displayImage}
              alt="Welcome to Revola Demo" 
              style={{ 
                maxWidth: '100%', 
                maxHeight: '100%', 
                objectFit: 'contain', 
                opacity: 0.95 ,
                borderRadius: '18px',
              }} 
            />
          </div>

          </div>
  
          {/* Agent Interaction Panel */}
          <div
            style={{
              width: '320px',
              backgroundColor: 'rgba(16, 16, 24, 0.65)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderRadius: '20px',
              padding: '24px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Agent Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: '24px',
                gap: '12px',
              }}
            >
              
              <h2
                style={{
                  fontSize: '1.4rem',
                  fontWeight: '600',
                  color: '#ffffff',
                  margin: 0,
                }}
              >
                Reva
              </h2>
            </div>
            
            {/* Agent Avatar centered vertically */}
            <div
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                marginBottom: '20px',
              }}
            >
              {/* Agent Image with Improved Mouth Animation */}
              
              <div
                style={{
                  width: '240px',
                  height: '240px',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: '2px solid rgba(183, 82, 255, 0.4)',
                  boxShadow: isAgentSpeaking ? '0 0 40px rgba(183, 82, 255, 0.2)' : '0 0 20px rgba(183, 82, 255, 0.1)',
                  position: 'relative',
                }}
              >
                <img
                  src="/revola-agent.png"
                  alt="Reva"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
  
                <div
                
              >
                <div
                 
                
                  >
                    <canvas
                      ref={serverCanvasRef}
                      style={{
                        width: '80px',
                        height: '20px',
                        borderRadius: '4px',
                      }}
                    />
                    <span 
                      style={{
                        color: isAgentSpeaking ? '#ffffff' : '#B0B0C0', 
                        fontSize: '13px',
                        fontWeight: isAgentSpeaking ? '500' : '400',
                      }}
                    >
                    </span>
                  </div>
                </div>

                {/* MOUTH DIV - With Animation */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '46%', // adjust this visually
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: isAgentSpeaking ? '30px' : '36px',
                    height: isAgentSpeaking ? '10px' : '8px',
                    backgroundColor: '#000000',
                    borderStyle: "solid",
                    borderWidth: "0 0 4px 0",    // only bottom border
                    borderColor: "transparent transparent #000 transparent",
                    borderBottomLeftRadius: 18,  // half the width
                    borderBottomRightRadius: 18,
                    animation: isAgentSpeaking ? 'talkingMouth 0.8s infinite ease-in-out' : 'none',
                    zIndex: 3,
                  }}
                />

                
                {/* Gradient overlay */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '0',
                    left: '0',
                    width: '100%',
                    height: '30%',
                    background: 'linear-gradient(to top, rgba(11, 11, 18, 0.7), transparent)',
                    zIndex: 1,
                  }}
                />
              </div>
              <div
                style={{
                  position: 'relative',
                  marginTop: '20px',
                  animation: 'fadeSlideUp 1s ease forwards',
                }}
              >
                {/* Speech Bubble */}
                <div
                  style={{
                    backgroundColor: 'rgba(81, 47, 101, 0.9)',
                    padding: '12px 20px',
                    borderRadius: '20px',
                    color: '#ffffff',
                    fontSize: '16px',
                    fontWeight: '500',
                    maxWidth: '240px',
                    textAlign: 'center',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                    position: 'relative',
                  }}
                >
                  Ask me anything!

                  {/* Bubble Tail */}
                  <div
                      style={{
                        position: 'absolute',
                        top: '-8px', // Move it slightly above the speech bubble
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 0,
                        height: 0,
                        borderLeft: '8px solid transparent',
                        borderRight: '8px solid transparent',
                        borderBottom: '8px solid rgba(81, 47, 101, 0.9)', // Now borderBottom, not borderTop
                      }}
                    />

                </div>
              </div>
            </div>
            
            {/* Bottom Controls */}
          <div
            style={{
              marginTop: 'auto',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
            }}
          >
            {/* User Speaking Indicator */}
            <div
              style={{
                display: 'flex' ,
                alignItems: 'center',
                gap: '12px',
                backgroundColor: 'rgba(28, 17, 35, 0.7)',
                padding: '8px 16px',
                borderRadius: '24px',
                border: isUserSpeaking 
                  ? '1px solid rgba(0, 162, 255, 0.5)' 
                  : '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              }}
            >
              <canvas
                ref={clientCanvasRef}
                style={{
                  width: '80px',
                  height: '40px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '6px',
                  opacity: isUserSpeaking ? 1 : 0.4,
                }}
              />
              <span 
                style={{
                  color: isUserSpeaking ? '#ffffff' : '#B0B0C0',
                  fontSize: '13px',
                  fontWeight: isUserSpeaking ? '600' : '400',
                }}
              >
              </span>
            </div>

            {/* Control Buttons */}
            <div
              style={{
                display: 'flex',
                gap: '12px',
              }}
            >
              {/* Mute/Unmute Button */}
              <button
                onClick={handleRecordingToggle}
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: isRecording ? 'rgba(248, 207, 207, 0.95)' : 'rgba(183, 82, 255, 0.15)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: isRecording ? '#ff4d4d' : '#B752FF',
                }}
              >
                {isRecording ? (
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                 <path d="M12 1C11.2044 1 10.4413 1.31607 9.87868 1.87868C9.31607 2.44129 9 3.20435 9 4V12C9 12.7956 9.31607 13.5587 9.87868 14.1213C10.4413 14.6839 11.2044 15 12 15C12.7956 15 13.5587 14.6839 14.1213 14.1213C14.6839 13.5587 15 12.7956 15 12V4C15 3.20435 14.6839 2.44129 14.1213 1.87868C13.5587 1.31607 12.7956 1 12 1Z" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                 <path d="M19 10V12C19 13.8565 18.2625 15.637 16.9497 16.9497C15.637 18.2625 13.8565 19 12 19C10.1435 19 8.36301 18.2625 7.05025 16.9497C5.7375 15.637 5 13.8565 5 12V10" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                 <path d="M12 19V23" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                 <path d="M8 23H16" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
               </svg>
                ) : (
                  
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                   <path d="M12 1C11.2044 1 10.4413 1.31607 9.87868 1.87868C9.31607 2.44129 9 3.20435 9 4V12C9 12.7956 9.31607 13.5587 9.87868 14.1213C10.4413 14.6839 11.2044 15 12 15C12.7956 15 13.5587 14.6839 14.1213 14.1213C14.6839 13.5587 15 12.7956 15 12V4C15 3.20435 14.6839 2.44129 14.1213 1.87868C13.5587 1.31607 12.7956 1 12 1Z" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                   <path d="M19 10V12C19 13.8565 18.2625 15.637 16.9497 16.9497C15.637 18.2625 13.8565 19 12 19C10.1435 19 8.36301 18.2625 7.05025 16.9497C5.7375 15.637 5 13.8565 5 12V10" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                   <path d="M12 19V23" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                   <path d="M8 23H16" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                   <line x1="1" y1="1" x2="23" y2="23" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round"/>
                 </svg>
                )}
              </button>

              {/* End Session Button */}
              <button
                onClick={disconnectConversation}
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: 'rgb(222, 60, 60)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#000000',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M6 6L18 18" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: '24px', 
              gap: '8px',
            }}
          >

            {/* Powered By Text */}
            <span
              style={{
                color: '#ffffff',
                opacity: 0.8,
                fontSize: '13px',
                textAlign: 'center',
              }}
            >
              Powered by Revola AI
            </span>

            {/* Logo Image */}
            <img
              src="/icon.png"
              alt="Revola Logo"
              style={{
                width: '20px',
                height: '20px',
                objectFit: 'contain',
                opacity: 0.85,
              }}
            />
          </div>

          </div>
        </div>
        </>
      )}
      
      {/* Global CSS for animations - Refined */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes pulse {
            0% { transform: scale(1); opacity: 0.7; }
            50% { transform: scale(1.05); opacity: 1; }
            100% { transform: scale(1); opacity: 0.7; }
          }
          
          @keyframes gradient-shift {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }

          
          @keyframes fadeSlideUp {
            0% {
              opacity: 0;
              transform: translateY(10px);
            }
            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }
          


          
          
          /* Fixed mouth animation */
            @keyframes talkingMouth {
        0% {
          transform: translateX(-50%) scaleY(1) scaleX(1);
        }
        25% {
          transform: translateX(-50%) scaleY(1.3) scaleX(1);
        }
        50% {
          transform: translateX(-50%) scaleY(0.9) scaleX(1);
        }
        75% {
          transform: translateX(-50%) scaleY(1.2) scaleX(1);
        }
        100% {
          transform: translateX(-50%) scaleY(1) scaleX(1);
        }
      }
        
      
          
          @keyframes scanDown {
            0% { top: 0; opacity: 0.7; }
            45% { opacity: 0.4; }
            50% { top: 100%; opacity: 0.1; }
            50.1% { top: 0; opacity: 0; }
            100% { top: 0; opacity: 0.7; }
          }
          
          * {
            box-sizing: border-box;
          }
          
          body {
            margin: 0;
            padding: 0;
          }
          
          ::-webkit-scrollbar {
            width: 6px;
          }
          
          ::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.1);
            border-radius: 10px;
          }
          
          ::-webkit-scrollbar-thumb {
            background: rgba(183, 82, 255, 0.3);
            border-radius: 10px;
          }
          
          ::-webkit-scrollbar-thumb:hover {
            background: rgba(183, 82, 255, 0.5);
          }
  
          input::placeholder {
            color: rgba(255, 255, 255, 0.3);
          }
  
          button, input {
            font-family: inherit;
          }
          
          /* Fade in animation for connected view */
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          
          [data-component="ConsolePage"] > div:last-child {
            animation: fadeIn 0.6s ease-out;
          }
        `
      }} />
    </div>
  )};