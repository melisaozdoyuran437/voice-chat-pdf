const LOCAL_RELAY_SERVER_URL: string =
  process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { WavRenderer } from '../utils/wav_renderer';
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'react-feather';
import { Button } from '../components/button/Button';
import { instructions } from '../constants/conversation_config.js'
import { slides } from '../constants/demo_slides.js'

/**
 * Type for all event logs
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

  useEffect(() => {
    // call localStorage operations inside useEffect to ensure they run only on the client side
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

  useEffect(() => {
    // Initialize RealtimeClient when apiKey is available
    if (apiKey || LOCAL_RELAY_SERVER_URL) {
      clientRef.current = new RealtimeClient(
        LOCAL_RELAY_SERVER_URL
          ? {
              url: LOCAL_RELAY_SERVER_URL,
            }
          : {
              url: 'wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview',
              apiKey: apiKey,
              dangerouslyAllowAPIKeyInBrowser: true,
              // debug: true,
            },
      );
    }
  }, [apiKey]);

  /**
   * Instantiate:
   * - WavRecorder (speech input)
   * - WavStreamPlayer (speech output)
   * - RealtimeClient (API client)
   */
  const wavRecorderRef = useRef<WavRecorder>(
    new WavRecorder({ sampleRate: 24000 }),
  );
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(
    new WavStreamPlayer({ sampleRate: 24000 }),
  );

  /**
   * References for
   * - Rendering audio visualization (canvas)
   * - Autoscrolling event logs
   * - Timing delta for event log displays
   * - Webcam recording
   */
  const clientCanvasRef = useRef<HTMLCanvasElement>(null);
  const serverCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const eventsScrollHeightRef = useRef(0);
  const eventsScrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<string>(new Date().toISOString());
  const blackStreamRef = useRef<MediaStream | null>(null);
  const [items, setItems] = useState<ItemType[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [showDefault, setShowDefault] = useState(true);
  const [textInput, setTextInput] = useState('');
  const [sessionUUID, setSessionUUID] = useState<string>(null);
  const [isRecording, setIsRecording] = useState(false);

  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isVideoRecording, setIsVideoRecording] = useState(false);

  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);

  // Demo slides
  const [isInDemoMode, setIsInDemoMode] = useState(false); // To control demo flow
  const [currentSlideIndex, setCurrentSlideIndex] = useState(-1); // Start before the first slide
  const [isDemoFinished, setIsDemoFinished] = useState(false);

  // Set a timer to hide the default image after 15 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowDefault(false);
    }, 25000);
    return () => clearTimeout(timer);
  }, []);

  // Now place the useEffect after the state declaration
  useEffect(() => {
    items.forEach((item) => {
      if (item.role === 'assistant' && (item as any).metadata?.image) {
        console.log(
          'Assistant response includes image URL:',
          (item as any).metadata.image,
        );
      }
    });
  }, [items]);

  useEffect(() => {
    // Request microphone and video permissions on page load
    const requestPermissions = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        console.log('Permissions granted');
      } catch (error) {
        console.error('Error requesting permissions:', error);
      }
    };
    requestPermissions();
    // Create a black stream and set it as the initial video source
    createBlackStream();
    if (videoRef.current && blackStreamRef.current) {
      videoRef.current.srcObject = blackStreamRef.current;
    }
    return () => {
      if (videoRef.current?.srcObject instanceof MediaStream) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  /**
   * Connect to conversation:
   * WavRecorder taks speech input, WavStreamPlayer output, client is API client
   */
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
      },
      turn_detection: {
        type: 'semantic_vad',
        eagerness: 'low',
      },
      temperature: 0.6,
      max_response_output_tokens: 1000,
    });
    console.log(client.sessionConfig);

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

    const intro = data.message;

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
    client.createResponse();

    // Set state variables
    startTimeRef.current = new Date().toISOString();
    setIsConnected(true);
    setRealtimeEvents([]);
    setItems(client.conversation.getItems());
    console.log('Connected to conversation');
    console.log(isRecording);
    console.log(client.isConnected());
    if (client.isConnected()) {
      if (isRecording) {
        await wavRecorder.record((data) => client.appendInputAudio(data.mono));
      }
    } else {
      console.error('RealtimeClient is not connected');
    }
  }, [isRecording]);

  /**
   * Disconnect and reset conversation state
   */
  const disconnectConversation = useCallback(async () => {
    setIsConnected(false);
    setRealtimeEvents([]);
    setItems([]);

    const client = clientRef.current;
    if (!client) throw new Error('RealtimeClient is not initialized');
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();
  }, []);

  /**
   * Unmute Audio Input
   */
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

  const createBlackStream = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const stream = canvas.captureStream(30);
    blackStreamRef.current = stream;
  };

  const toggleCamera = () => {
    if (isCameraOn) {
      if (videoRef.current?.srcObject instanceof MediaStream) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = blackStreamRef.current;
      }
    } else {
      const startWebcam = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (error) {
          console.error('Error accessing webcam:', error);
        }
      };
      startWebcam();
    }
    setIsCameraOn(!isCameraOn);
  };

  interface MediaItem {
    type?: 'video' | 'image';
    path: string;
    caption?: string;
  }

  const [contextResponse, setContextResponse] = useState<{
    message: string;
    images?: MediaItem[];
  } | null>(null);

  const injectContext = async (transcript: string) => {
    const client = clientRef.current;
    client.updateSession({
      instructions: instructions
    });
    if (!client || !sessionUUID) throw new Error("Session not ready");
  
    transcript = transcript.trim();
    if (!transcript) return;
  
    const items = client.conversation.getItems();
    const lastAssistant = items
      .filter((i) => i.role === "assistant")
      .reverse()[0];

    if (lastAssistant) {
      client.cancelResponse(lastAssistant.id);
    }
  
    // 2) Give the socket a moment to settle (optional, but avoids races)
    await new Promise((r) => setTimeout(r, 100));
  
    // 3) Fetch your vector‑store answer from your FastAPI
    let data: { message: string; images: any[] };
    try {
      const res = await fetch(`http://127.0.0.1:8000/get-context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid: sessionUUID, query: transcript }),
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
  
    // 4) Build one clear instruction + context string
    const prompt = `
    <user_query> ${transcript} <user_query>
    <context>${data.message}<context>`;

  console.log(prompt);
  
    // 5) Finally, send this single prompt
    client.sendUserMessageContent([
      { type: "input_text", text: prompt },
    ]);
    client.createResponse();
  };
  
  
  /**
   * Auto-scroll the event logs
   */
  useEffect(() => {
    if (eventsScrollRef.current) {
      const eventsEl = eventsScrollRef.current;
      const scrollHeight = eventsEl.scrollHeight;
      // Only scroll if height has just changed
      if (scrollHeight !== eventsScrollHeightRef.current) {
        eventsEl.scrollTop = scrollHeight;
        eventsScrollHeightRef.current = scrollHeight;
      }
    }
  }, [realtimeEvents]);

  /**
   * Auto-scroll the conversation logs
   */
  useEffect(() => {
    const conversationEls = [].slice.call(
      document.body.querySelectorAll('[data-conversation-content]'),
    );
    for (const el of conversationEls) {
      const conversationEl = el as HTMLDivElement;
      conversationEl.scrollTop = conversationEl.scrollHeight;
    }
  }, [items]);

  /**
   * Set up render loops for the visualization canvas
   */
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
            WavRenderer.drawBars(
              clientCanvas,
              clientCtx,
              result.values,
              'oklch(0.627 0.265 303.9)',
              3,
              0,
              8,
              true,
            );
          }
        }
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
            WavRenderer.drawBars(
              serverCanvas,
              serverCtx,
              result.values,
              'oklch(0.627 0.265 303.9)',
              3,
              0,
              8,
              true,
            );
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

  const handleTextInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setTextInput(event.target.value);
  };

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

  /**
   * Core RealtimeClient and audio capture setup
   * Set all of our instructions, tools, events and more
   */
  useEffect(() => {
    const client = clientRef.current
    const wavStreamPlayer = wavStreamPlayerRef.current
    if (!client || !sessionUUID) return
  
    console.log('[useEffect] 🏷 registering handlers')
  
    const onTranscript = async (evt: any) => {
      if (evt.event.type !== 'conversation.item.input_audio_transcription.completed')
        return
      console.log('[onTranscript] transcript:', evt.event.transcript)
      console.log('get context')
      await injectContext(evt.event.transcript.trim())
      console.log('context came')
    }
  
    const onConvUpdate = async ({ item, delta }: any) => {
      if (delta?.audio) {
        // ADD DELAY HERE BEFORE ADDING AUDIO
        await new Promise((r) => setTimeout(r, 750)); // adjust to 1000ms if you want longer
    
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
    
      if (item.status === 'completed' && item.formatted.audio?.length) {
        WavRecorder.decode(item.formatted.audio, 24000, 24000).then((wav) => {
          item.formatted.file = wav;
        });
      }
    
      setItems(client.conversation.getItems());
    };
    
  
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


  useEffect(() => {
    if (isInDemoMode && !isDemoFinished && wasAgentSpeakingRef.current && !isAgentSpeaking) {
      console.log('Agent stopped speaking during demo. Advancing slide...');

      // Add a small delay to prevent triggering on brief pauses
      const timerId = setTimeout(() => {
         // Double-check if the agent is still silent before advancing
         if (!isAgentSpeaking) {
            advanceSlide();
         } else {
            console.log("Agent started speaking again, cancelling slide advance.");
         }
      }, 1000); // Delay of 1 second (adjust as needed)

      // Cleanup function to cancel the timeout if the component unmounts
      // or if the agent starts speaking again before the timeout finishes
      return () => clearTimeout(timerId);

    }
  }, [isAgentSpeaking])

  
  
  /**
   * Render the application
   */
  return (
    <div
      data-component="ConsolePage"
      style={{
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#171717',
        minHeight: '100vh',
        overflowX: 'hidden',
        overflowY: 'hidden',
        margin: 0,
        padding: 0,
      }}
    >
      <img
        src="icon.png"
        alt="revolalogo"
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          width: '50px',
          height: '50px',
        }}
      />
      {!isConnected ? (
        <Button
          label="Connect"
          onClick={connectConversation}
          style={{
            marginTop: '20px',
            padding: '15px 30px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: 'rgba(183, 82, 255, 0.9)',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '18px',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            transition: 'all 0.3s ease',
            boxShadow: '0 0 25px rgba(183, 82, 255, 0.9)',
            transform: 'perspective(1px) translateZ(0)',
            animation: 'pulse 2s infinite',
          }}
        />
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#171717',
              gap: '20px',
            }}
          >
            {/* Context Media */}
            <div
              className="context-media"
              style={{
                marginBottom: '20px',
                justifyContent: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <h2
                style={{
                  fontSize: '30px',
                  fontWeight: 'bold',
                  marginLeft: '200px',
                  color: ' #f1f3f4',
                }}
              >
                Revola AI's Screen
              </h2>
              {showDefault ||
              !(
                contextResponse &&
                contextResponse.images &&
                contextResponse.images.length > 0
              ) ? (
                <div className="assistant-image">
                  <img
                    src="/images/default.png"
                    alt="Default"
                    style={{
                      maxWidth: '1000px',
                      maxHeight: '700px',
                      borderRadius: '20px',
                      marginLeft: '200px',
                      boxShadow: '0 0 20px rgba(149, 76, 252, 0.6)',
                    }}
                  />
                </div>
              ) : (
                (() => {
                  const media = contextResponse.images[0] as MediaItem | string;
                  if (typeof media === 'string') {
                    if (media.includes('/videos/')) {
                      return (
                        <div className="assistant-video">
                          <video
                            autoPlay
                            muted
                            controls
                            style={{
                              maxWidth: '1000px',
                              maxHeight: '700px',
                              border: '1px solid #000',
                              borderRadius: '10px',
                              marginLeft: '150px',
                            }}
                          >
                            <source
                              src={media.replace(/^public/, '')}
                              type="video/mp4"
                            />
                            Your browser does not support the video tag.
                          </video>
                        </div>
                      );
                    } else {
                      return (
                        <div className="assistant-image">
                          <img
                            src={media.replace(/^public/, '')}
                            alt="Context related to answer"
                            style={{
                              maxWidth: '1000px',
                              maxHeight: '700px',
                              marginLeft: '150px',
                              border: '1px solid #000',
                              borderRadius: '10px',
                            }}
                          />
                        </div>
                      );
                    }
                  } else if (typeof media === 'object' && media.path) {
                    if (media.type === 'video') {
                      return (
                        <div className="assistant-video">
                          <video
                            autoPlay
                            muted
                            controls
                            style={{ maxWidth: '200px', marginLeft: '150px' }}
                          >
                            <source
                              src={media.path.replace(/^public/, '')}
                              type="video/mp4"
                            />
                            Your browser does not support the video tag.
                          </video>
                          {media.caption && (
                            <div style={{ fontSize: '15px', color: '#666' }}>
                              {media.caption}
                            </div>
                          )}
                        </div>
                      );
                    } else {
                      return (
                        <div className="assistant-image">
                          <img
                            src={media.path.replace(/^public/, '')}
                            alt="Context related to answer"
                            style={{ maxWidth: '500px', marginLeft: '150px' }}
                          />
                          {media.caption && (
                            <div style={{ fontSize: '12px', color: '#666' }}>
                              {media.caption}
                            </div>
                          )}
                        </div>
                      );
                    }
                  }
                  return null;
                })()
              )}
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                marginLeft: '20px',
                gap: '10px',
              }}
            >
              {/* User Webcam View */}
              <div
                className="user-webcam"
                style={{
                  position: 'relative',
                  textAlign: 'center',
                  marginRight: '200px',
                }}
              >
                <h2
                  className="text-center text-lg font-semibold mb-2 text-gray-100"
                  style={{ color: '#ffffff' }}
                >
                  You
                </h2>
                <div className="webcam-view">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    style={{
                      width: '100%',
                      maxWidth: '300px',
                      height: '200px',
                      backgroundColor: 'black',
                      boxShadow: isUserSpeaking
                        ? '0 0 10px 3px oklch(0.627 0.265 303.9)'
                        : 'none',
                      border: '3px solid #000',
                      borderRadius: '20px',
                    }}
                  />
                  <canvas
                    ref={clientCanvasRef}
                    style={{
                      width: '30px',
                      height: '30px',
                      position: 'absolute',
                      top: '60px',
                      right: '10px',
                      borderRadius: '100%',
                      overflow: 'hidden',
                      border: isUserSpeaking
                        ? '3px solid oklch(0.627 0.265 303.9)'
                        : 'none',
                    }}
                  />
                </div>
              </div>
              <div
                className="user-webcam"
                style={{
                  position: 'relative',
                  textAlign: 'center',
                  marginRight: '200px',
                }}
              >
                <h2
                  className="text-center text-lg font-semibold mb-2"
                  style={{ color: '#ffffff' }}
                >
                  Revola AI
                </h2>
                <div className="webcam-view">
                  <div
                    style={{
                      width: '300px',
                      height: '200px',
                      backgroundColor: 'black',
                      boxShadow: isAgentSpeaking
                        ? '0 0 10px 3px oklch(0.627 0.265 303.9)'
                        : 'none',
                      border: '3px solid #000',
                      borderRadius: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <img
                      src="icon.png"
                      alt="Revola Logo"
                      style={{
                        width: '100px',
                        height: '100px',
                      }}
                    />
                    <canvas
                      ref={serverCanvasRef}
                      style={{
                        width: '30px',
                        height: '30px',
                        position: 'absolute',
                        top: '60px',
                        right: '10px',
                        borderRadius: '100%',
                        overflow: 'hidden',
                        border: isAgentSpeaking
                          ? '3px solid oklch(0.627 0.265 303.9)'
                          : 'none',
                      }}
                    />
                  </div>
                </div>
                <div
                  style={{
                    marginTop: '20px',
                    textAlign: 'center',
                    display: 'flex',
                    gap: '10px',
                    justifyContent: 'center',
                    flexDirection: 'row',
                  }}
                >
                  <input
                    type="text"
                    value={textInput}
                    onChange={handleTextInputChange}
                    placeholder="Type your message here"
                    style={{
                      width: '80%',
                      padding: '10px',
                      borderRadius: '5px',
                      border: '1px solid #ccc',
                      backgroundColor: 'rgba(34, 34, 34, 0.81)',
                      color: 'rgb(255, 255, 255)',
                    }}
                  />

                  <button
                    onClick={handleTextInputSubmit}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '5px',
                      border: 'none',
                      backgroundColor: 'oklch(0.627 0.265 303.9)',
                      color: '#ffffff',
                      cursor: 'pointer',
                    }}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Text Input for User */}
          {/* Controls: Toggle and Disconnect */}
          <div className="controls" style={{ display: 'flex', gap: '10px' }}>
            <Button
              icon={isRecording ? Mic : MicOff}
              onClick={handleRecordingToggle}
            />
            <Button
              icon={isCameraOn ? Video : VideoOff}
              onClick={toggleCamera}
            />
            <Button
              style={{ backgroundColor: '#d65656' }}
              icon={PhoneOff}
              onClick={disconnectConversation}
            />
          </div>
        </>
      )}
    </div>
  );
}
