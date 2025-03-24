/**
 * Running a local relay server will allow you to hide your API key
 * and run custom logic on the server
 *
 * Set the local relay server address to:
 * REACT_APP_LOCAL_RELAY_SERVER_URL=http://localhost:8081
 *
 * This will also require you to set OPENAI_API_KEY= in a `.env` file
 * You can run it with `npm run relay`, in parallel with `npm start`
 */
const LOCAL_RELAY_SERVER_URL: string =
  process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';

import { useEffect, useRef, useCallback, useState } from 'react';

import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { instructions } from '../utils/conversation_config.js';
import { WavRenderer } from '../utils/wav_renderer';

import {
  X,
  Edit,
  Zap,
  ArrowUp,
  ArrowDown,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Link,
  PhoneOff,
} from 'react-feather';
import { Button } from '../components/button/Button';
import { Toggle } from '../components/toggle/Toggle';

/**
 * Type for all event logs
 */
interface RealtimeEvent {
  time: string;
  source: 'client' | 'server';
  count?: number;
  event: { [key: string]: any };
}

export function ConsolePage() {
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
          ? { url: LOCAL_RELAY_SERVER_URL }
          : {
              apiKey: apiKey,
              dangerouslyAllowAPIKeyInBrowser: true,
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

  /**
   * All of our variables for displaying application state
   * - items are all conversation items (dialog)
   * - realtimeEvents are event logs, which can be expanded
   * - memoryKv is for set_memory() function
   * - coords, marker are for get_weather() function
   */
  const [items, setItems] = useState<ItemType[]>([]);

  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<{
    [key: string]: boolean;
  }>({});
  const [isConnected, setIsConnected] = useState(false);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [memoryKv, setMemoryKv] = useState<{ [key: string]: any }>({});
  const [showDefault, setShowDefault] = useState(true);
  const [textInput, setTextInput] = useState('');
  const [showLogs, setShowLogs] = useState(false);

  /* Voice Recording Variables */

  const [isRecording, setIsRecording] = useState(true);

  /* Recording Video Variables */

  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isVideoRecording, setIsVideoRecording] = useState(false);

  /**
   * States for user and assistant speaking
   */
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);

  // Set a timer to hide the default image after 15 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowDefault(false);
    }, 25000);
    return () => clearTimeout(timer);
  }, []);

  /**
   * Utility for formatting the timing of logs
   */
  const formatTime = useCallback((timestamp: string) => {
    const startTime = startTimeRef.current;
    const t0 = new Date(startTime).valueOf();
    const t1 = new Date(timestamp).valueOf();
    const delta = t1 - t0;
    const hs = Math.floor(delta / 10) % 100;
    const s = Math.floor(delta / 1000) % 60;
    const m = Math.floor(delta / 60_000) % 60;
    const pad = (n: number) => {
      let s = n + '';
      while (s.length < 2) {
        s = '0' + s;
      }
      return s;
    };
    return `${pad(m)}:${pad(s)}.${pad(hs)}`;
  }, []);

  // console.log("Conversation items:", items);

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

    const startWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        startVideoRecording(stream);
      } catch (error) {
        console.error('Error accessing webcam:', error);
      }
    };

    // Comment out the initial webcam start
    // startWebcam();

    return () => {
      if (videoRef.current?.srcObject instanceof MediaStream) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // useEffect(() => {
  //   window.addEventListener('beforeunload', saveVideoRecording);
  //   return () => {
  //     window.removeEventListener('beforeunload', saveVideoRecording);
  //   };
  // }, []);

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
      turn_detection: { type: 'server_vad' },
    });

    // Connect to realtime API
    await client.connect();
    client.sendUserMessageContent([
      {
        type: `input_text`,
        text: `HIDDEN_INSTRUCTION: 
Begin the interaction with a warm, engaging tone. Start by saying: 
"Hello and welcome to your live Revola demo! I’m Revola AI, your presenter today. I’ll walk you through how Revola can supercharge your sales process. But first, may I know your name and email?" 
When the user responds (for example, "Hi, I’m Alex and my email is  alex@startup.com""), reply with: 
"Nice to meet you, , Alex! Would you like to start with our product demo, or dive right into Q&A?" 
Then, if the user says q/a ask for their questions. If they say demo transition to the demo scene by describing the screen changes: 
"Revola is your AI-powered sales intelligence assistant. Here’s how it works:You enter your company’s website, and we instantly generate a full business overview.
Then, our AI continuously finds companies that are showing buying signals—so you know exactly who to reach out to.
We research these companies, identify key decision-makers, and even generate personalized outreach messages for you.
And soon, we’ll even have an AI agent that can run sales meetings for you!"
." 
Finally, pause for further questions after demonstrating these features.`,
        // text: `For testing purposes, I want you to list ten car brands. Number each item, e.g. "one (or whatever number you are one): the item name".`
      },
    ]);

    // Set state variables
    startTimeRef.current = new Date().toISOString();
    setIsConnected(true);
    setRealtimeEvents([]);
    setItems(client.conversation.getItems());
    console.log('Connected to conversation');
    console.log(isRecording);
    if (isRecording) {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
  }, [isRecording]);

  /**
   * Disconnect and reset conversation state
   */
  const disconnectConversation = useCallback(async () => {
    setIsConnected(false);
    setRealtimeEvents([]);
    setItems([]);
    setMemoryKv({});

    const client = clientRef.current;
    if (!client) throw new Error('RealtimeClient is not initialized');
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();
  }, []);

  const deleteConversationItem = useCallback(async (id: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('RealtimeClient is not initialized');
    client.deleteItem(id);
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

  {
    /*  Video Recording Functions */
  }
  const startVideoRecording = (stream: MediaStream) => {
    mediaRecorderRef.current = new MediaRecorder(stream);
    recordedChunksRef.current = [];

    mediaRecorderRef.current.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    mediaRecorderRef.current.start();
    setIsVideoRecording(true);
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

  const saveVideoRecording = () => {
    const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'recorded_video.webm';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
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
    if (!client) throw new Error('RealtimeClient is not initialized');

    transcript = transcript.trim();
    if (!transcript) return;

    // 1. Get context
    const response = await fetch(
      `/api/context?query=${encodeURIComponent(transcript)}`,
    );
    const data = await response.json();
    console.log('API response:', data); // Debug log
    setContextResponse(data);

    // 2. Combine transcript + context into one user message
    const combinedMessage = `
  User said: "${transcript}"
  
  Relevant context:
  ${data.message}
    `;

    // 3. Send the combined message as a user message
    client.sendUserMessageContent([
      {
        type: 'input_text',
        text: combinedMessage,
      },
    ]);

    // 4. Trigger assistant’s response if needed
    if (client.getTurnDetectionType() === null) {
      client.createResponse();
    }
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

  const toggleLogs = () => {
    setShowLogs((prevShowLogs) => !prevShowLogs);
  };

  /**
   * Core RealtimeClient and audio capture setup
   * Set all of our instructions, tools, events and more
   */
  useEffect(() => {
    // Get refs
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const client = clientRef.current;
    if (!client) return;

    // Set instructions
    client.updateSession({ instructions: instructions });
    // Set transcription, otherwise we don't get user transcriptions back
    client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });

    // Add tools
    client.addTool(
      {
        name: 'set_memory',
        description: 'Saves important data about the user into memory.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description:
                'The key of the memory value. Always use lowercase and underscores, no other characters.',
            },
            value: {
              type: 'string',
              description: 'Value can be anything represented as a string',
            },
          },
          required: ['key', 'value'],
        },
      },
      async ({ key, value }: { [key: string]: any }) => {
        setMemoryKv((memoryKv) => {
          const newKv = { ...memoryKv };
          newKv[key] = value;
          return newKv;
        });
        return { ok: true };
      },
    );

    // handle realtime events from client + server for event logging
    client.on('realtime.event', async (realtimeEvent: RealtimeEvent) => {
      if (
        realtimeEvent.event.type ===
        'conversation.item.input_audio_transcription.completed'
      ) {
        console.log(
          'conversation.item.input_audio_transcription.completed',
          realtimeEvent,
        );
        // transcript of a user message is available
        await injectContext(realtimeEvent.event.transcript);
      }
      setRealtimeEvents((realtimeEvents) => {
        const lastEvent = realtimeEvents[realtimeEvents.length - 1];
        if (lastEvent?.event.type === realtimeEvent.event.type) {
          // if we receive multiple events in a row, aggregate them for display purposes
          lastEvent.count = (lastEvent.count || 0) + 1;
          return realtimeEvents.slice(0, -1).concat(lastEvent);
        } else {
          return realtimeEvents.concat(realtimeEvent);
        }
      });
    });
    client.on('error', (event: any) => console.error(event));
    client.on('conversation.interrupted', async () => {
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }
    });
    client.on('conversation.updated', async ({ item, delta }: any) => {
      const items = client.conversation.getItems();
      if (delta?.audio) {
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
      if (item.status === 'completed' && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(
          item.formatted.audio,
          24000,
          24000,
        );
        item.formatted.file = wavFile;
      }
      setItems(items);
    });

    setItems(client.conversation.getItems());

    return () => {
      // cleanup; resets to defaults
      client.reset();
    };
  }, [clientRef.current]);

  /**
   * Render the application
   */
  return (
    <div
      data-component="ConsolePage"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f1f3f4',
        minHeight: '100vh',
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
            padding: '10px 20px',
            borderRadius: '5px',
            border: 'none',
            backgroundColor: 'oklch(0.627 0.265 303.9)',
            color: '#fff',
            cursor: 'pointer',
          }}
        />
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#f1f3f4',
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
              <h2 style={{ fontSize: '30px', fontWeight: 'bold' }}>
                Demo for Revola AI
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
                    alt="Default context"
                    style={{
                      maxWidth: '1300px',
                      maxHeight: '700px',
                      border: '3px solid #000',
                      borderRadius: '20px',
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
                              maxWidth: '1300px',
                              maxHeight: '700px',
                              border: '1px solid #000',
                              borderRadius: '10px',
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
                              maxWidth: '1300px',
                              maxHeight: '700px',
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
                            style={{ maxWidth: '500px' }}
                          >
                            <source
                              src={media.path.replace(/^public/, '')}
                              type="video/mp4"
                            />
                            Your browser does not support the video tag.
                          </video>
                          {media.caption && (
                            <div style={{ fontSize: '12px', color: '#666' }}>
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
                            style={{ maxWidth: '500px' }}
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
                }}
              >
                <h2 className="text-center text-lg font-semibold mb-2">
                  "User's Name"
                </h2>
                <div className="webcam-view">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    style={{
                      width: '400px',
                      height: '300px',
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
                }}
              >
                <h2 className="text-center text-lg font-semibold mb-2">
                  Revola AI
                </h2>
                <div className="webcam-view">
                  <div
                    style={{
                      width: '400px',
                      height: '300px',
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
                        width: '200px',
                        height: '200px',
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
                    }}
                  />
                  <button
                    onClick={handleTextInputSubmit}
                    style={{
                      marginLeft: '10px',
                      padding: '10px 20px',
                      borderRadius: '5px',
                      border: 'none',
                      backgroundColor: 'oklch(0.627 0.265 303.9)',
                      color: '#fff',
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
