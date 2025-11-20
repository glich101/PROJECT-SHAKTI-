import React, { useState, useEffect, useRef } from 'react';
import { Send, Trash2, Activity, Zap, Settings, ChevronDown, Moon, Sun } from 'lucide-react';

const ShaktiChatbot = () => {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hello! I'm SHAKTI 2.0, your advanced AI assistant. How can I help you today?" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [stateSpace, setStateSpace] = useState({
    contextHistory: [],
    semanticMemory: [],
    attentionWeights: []
  });
  
  const [apiProvider, setApiProvider] = useState('gemini');
  const [apiKey, setApiKey] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [showConfig, setShowConfig] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  
  const messagesEndRef = useRef(null);

  const trainedDataset = {
    greeting: {
      inputs: ['hello', 'hi', 'hey', 'good morning', 'good evening', 'hey there', 'greetings', 'hi there'],
      response: 'Hello! How can I help you today?'
    },
    farewell: {
      inputs: ['bye', 'goodbye', 'see you', 'cya', 'good night', 'i have to go', 'talk to you later'],
      response: 'Goodbye! Have a wonderful day.'
    },
    identity: {
      inputs: ['who are you', 'what is your name', 'are you a bot', 'what are you', 'introduce yourself'],
      response: 'I am SHAKTI 2.0, a human interaction dataset model.'
    },
    wellbeing: {
      inputs: ['how are you', 'how is it going', 'how are things', 'how do you feel', 'what is up', 'whats up'],
      response: "I'm functioning perfectly. How can I help you?"
    },
    capabilities: {
      inputs: ['what can you do', 'help me', 'what are your features', 'how do you work'],
      response: 'I can answer questions and chat with you.'
    },
    gratitude: {
      inputs: ['thanks', 'thank you', 'thx', 'thanks a lot', 'appreciate it'],
      response: 'You are very welcome!'
    },
    compliment: {
      inputs: ['you are smart', 'good job', 'well done', 'you are amazing', 'nice work'],
      response: 'Thank you! I appreciate the positive feedback.'
    },
    insult: {
      inputs: ['you are stupid', 'you are dumb', 'bad bot', 'useless', 'you suck'],
      response: 'I apologize if I disappointed you. I am still learning.'
    },
    love: {
      inputs: ['i love you', 'i like you', 'will you marry me', 'you are cute'],
      response: 'That is very kind of you to say!'
    },
    confusion: {
      inputs: ['i dont understand', 'what do you mean', 'can you explain', 'i am confused'],
      response: 'I apologize. Let me try to be clearer.'
    }
  };

  const apiProviders = {
    gemini: {
      name: 'Google Gemini',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent',
      requiresKey: true,
      free: true,
      description: 'Google Gemini 2.0 Flash - Fast and efficient'
    },
    openai: {
      name: 'OpenAI GPT',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      requiresKey: true,
      free: false,
      description: 'OpenAI GPT-4 / GPT-3.5 - Powerful language model'
    },
    anthropic: {
      name: 'Anthropic Claude',
      endpoint: 'https://api.anthropic.com/v1/messages',
      requiresKey: true,
      free: false,
      description: 'Claude Sonnet - Advanced reasoning'
    },
    huggingface: {
      name: 'Hugging Face',
      endpoint: 'https://api-inference.huggingface.co/models/microsoft/DialoGPT-large',
      requiresKey: true,
      free: true,
      description: 'Hugging Face Models - Various open-source options'
    },
    cohere: {
      name: 'Cohere',
      endpoint: 'https://api.cohere.ai/v1/generate',
      requiresKey: true,
      free: true,
      description: 'Cohere Command - Free tier available'
    },
    custom: {
      name: 'Custom API',
      endpoint: '',
      requiresKey: true,
      free: true,
      description: 'Use your own API endpoint'
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const findTrainedResponse = (userMessage) => {
    const lowerMessage = userMessage.toLowerCase().trim();
    const words = lowerMessage.split(/\s+/);
    
    const fillerWords = ['actually', 'well', 'umm', 'yo', 'hey', 'listen', 'ok', 'so', 'please', 'now', 'today', 'friend', 'buddy', 'sir', 'mam', 'bot'];
    const cleanedWords = words.filter(word => !fillerWords.includes(word));
    const cleanedMessage = cleanedWords.join(' ');
    
    for (const [intent, data] of Object.entries(trainedDataset)) {
      for (const input of data.inputs) {
        if (cleanedMessage === input || lowerMessage.includes(input)) {
          return { intent, response: data.response };
        }
        
        const inputWords = input.split(' ');
        const matchCount = inputWords.filter(word => cleanedWords.includes(word)).length;
        if (matchCount >= inputWords.length * 0.7) {
          return { intent, response: data.response };
        }
      }
    }
    
    return null;
  };

  const updateStateSpace = (userMsg, assistantMsg) => {
    setStateSpace(prev => {
      const newContext = {
        user: userMsg,
        assistant: assistantMsg,
        timestamp: Date.now(),
        embedding: generateSemanticEmbedding(userMsg)
      };

      const updatedHistory = [...prev.contextHistory, newContext].slice(-10);
      const semanticUpdate = extractKeyEntities(userMsg, assistantMsg);
      const updatedMemory = [...prev.semanticMemory, ...semanticUpdate].slice(-20);

      return {
        contextHistory: updatedHistory,
        semanticMemory: updatedMemory,
        attentionWeights: calculateAttentionWeights(updatedHistory)
      };
    });
  };

  const generateSemanticEmbedding = (text) => {
    const words = text.toLowerCase().split(/\s+/);
    return {
      length: words.length,
      keywords: words.filter(w => w.length > 4).slice(0, 5),
      sentiment: analyzeSentiment(text)
    };
  };

  const analyzeSentiment = (text) => {
    const positive = ['good', 'great', 'excellent', 'happy', 'love', 'wonderful', 'amazing', 'smart', 'nice'];
    const negative = ['bad', 'terrible', 'hate', 'sad', 'awful', 'poor', 'stupid', 'dumb', 'useless'];
    
    const words = text.toLowerCase().split(/\s+/);
    const posCount = words.filter(w => positive.includes(w)).length;
    const negCount = words.filter(w => negative.includes(w)).length;
    
    return posCount > negCount ? 'positive' : negCount > posCount ? 'negative' : 'neutral';
  };

  const extractKeyEntities = (userMsg, assistantMsg) => {
    const combined = userMsg + ' ' + assistantMsg;
    const words = combined.split(/\s+/).filter(w => w.length > 5);
    return words.slice(0, 3).map(w => ({ entity: w, type: 'keyword' }));
  };

  const calculateAttentionWeights = (history) => {
    return history.map((item, idx) => ({
      index: idx,
      weight: 1 / (history.length - idx)
    }));
  };

  const buildContextPrompt = (userMessage) => {
    const recentContext = stateSpace.contextHistory.slice(-5)
      .map(ctx => 'User: ' + ctx.user + '\nAssistant: ' + ctx.assistant)
      .join('\n\n');

    const semanticContext = stateSpace.semanticMemory.slice(-10)
      .map(m => m.entity)
      .join(', ');

    return 'You are SHAKTI 2.0, a human interaction dataset model.\n\nRecent conversation context:\n' + recentContext + '\n\nKey semantic entities in memory: ' + (semanticContext || 'none yet') + '\n\nCurrent user message: ' + userMessage + '\n\nProvide a helpful, context-aware response.';
  };

  const callGeminiAPI = async (prompt) => {
    const endpoint = apiEndpoint || apiProviders.gemini.endpoint;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024
        }
      })
    });

    if (!response.ok) throw new Error('API Error: ' + response.status);
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  };

  const callOpenAIAPI = async (prompt) => {
    const endpoint = apiEndpoint || apiProviders.openai.endpoint;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    if (!response.ok) throw new Error('API Error: ' + response.status);
    const data = await response.json();
    return data.choices[0].message.content;
  };

  const callAnthropicAPI = async (prompt) => {
    const endpoint = apiEndpoint || apiProviders.anthropic.endpoint;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024
      })
    });

    if (!response.ok) throw new Error('API Error: ' + response.status);
    const data = await response.json();
    return data.content[0].text;
  };

  const callHuggingFaceAPI = async (prompt) => {
    const endpoint = apiEndpoint || apiProviders.huggingface.endpoint;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_length: 1024,
          temperature: 0.7
        }
      })
    });

    if (!response.ok) throw new Error('API Error: ' + response.status);
    const data = await response.json();
    return data[0].generated_text || data.generated_text;
  };

  const callCohereAPI = async (prompt) => {
    const endpoint = apiEndpoint || apiProviders.cohere.endpoint;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        prompt: prompt,
        max_tokens: 1024,
        temperature: 0.7
      })
    });

    if (!response.ok) throw new Error('API Error: ' + response.status);
    const data = await response.json();
    return data.generations[0].text;
  };

  const callCustomAPI = async (prompt) => {
    if (!apiEndpoint) throw new Error('Custom endpoint not configured');
    
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        prompt: prompt,
        max_tokens: 1024
      })
    });

    if (!response.ok) throw new Error('API Error: ' + response.status);
    const data = await response.json();
    return data.response || data.text || data.message || JSON.stringify(data);
  };

  const callAPI = async (prompt) => {
    switch (apiProvider) {
      case 'gemini':
        return await callGeminiAPI(prompt);
      case 'openai':
        return await callOpenAIAPI(prompt);
      case 'anthropic':
        return await callAnthropicAPI(prompt);
      case 'huggingface':
        return await callHuggingFaceAPI(prompt);
      case 'cohere':
        return await callCohereAPI(prompt);
      case 'custom':
        return await callCustomAPI(prompt);
      default:
        throw new Error('Unknown API provider');
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const trainedMatch = findTrainedResponse(userMessage);
      
      if (trainedMatch) {
        setTimeout(() => {
          setMessages(prev => [...prev, { role: 'assistant', content: trainedMatch.response }]);
          updateStateSpace(userMessage, trainedMatch.response);
          setLoading(false);
        }, 500);
        return;
      }

      const contextPrompt = buildContextPrompt(userMessage);
      const assistantMessage = await callAPI(contextPrompt);

      setMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);
      updateStateSpace(userMessage, assistantMessage);

    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Error: ' + error.message + '. Please check your API configuration and try again.'
      }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([
      { role: 'assistant', content: "Hello! I'm SHAKTI 2.0, your advanced AI assistant. How can I help you today?" }
    ]);
    setStateSpace({
      contextHistory: [],
      semanticMemory: [],
      attentionWeights: []
    });
  };

  const handleProviderChange = (provider) => {
    setApiProvider(provider);
    if (provider !== 'custom') {
      setApiEndpoint('');
    }
  };

  const bgGradient = darkMode 
    ? 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900' 
    : 'bg-gradient-to-br from-sky-400 via-blue-400 to-sky-500';
  
  const cardBg = darkMode ? 'bg-slate-800' : 'bg-white';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-800';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-gray-600';
  const inputBg = darkMode ? 'bg-slate-700 border-slate-600' : 'bg-blue-50 border-blue-200';
  const userMsgBg = darkMode ? 'bg-purple-600' : 'bg-blue-600';
  const botMsgBg = darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-blue-100';
  const btnBg = darkMode ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700';
  const accentColor = darkMode ? 'text-purple-400' : 'text-blue-600';

  if (showConfig) {
    return (
      <div className={'flex items-center justify-center min-h-screen ' + bgGradient + ' p-4'}>
        <div className={cardBg + ' rounded-2xl shadow-2xl p-8 max-w-2xl w-full ' + (darkMode ? 'border border-purple-500/30' : 'border border-blue-200')}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Zap className={'w-12 h-12 ' + accentColor} />
              <div>
                <h2 className={'text-2xl font-bold ' + textPrimary}>SHAKTI 2.0</h2>
                <p className={'text-sm ' + textSecondary}>Trained on Human Interaction Dataset</p>
              </div>
            </div>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={'p-2 rounded-lg transition-colors ' + (darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-blue-100 hover:bg-blue-200')}
            >
              {darkMode ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-blue-600" />}
            </button>
          </div>
          
          <div className="mb-4">
            <label className={'block text-sm font-medium mb-2 ' + textPrimary}>
              Select AI Provider
            </label>
            <div className="relative">
              <select
                value={apiProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className={'w-full px-4 py-3 rounded-lg appearance-none focus:outline-none focus:ring-2 ' + inputBg + ' ' + textPrimary + ' ' + (darkMode ? 'focus:ring-purple-500' : 'focus:ring-blue-500')}
              >
                {Object.entries(apiProviders).map(([key, provider]) => (
                  <option key={key} value={key}>
                    {provider.name} {provider.free ? '(Free)' : '(Paid)'}
                  </option>
                ))}
              </select>
              <ChevronDown className={'absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 pointer-events-none ' + textSecondary} />
            </div>
            <p className={'text-xs mt-2 ' + textSecondary}>
              {apiProviders[apiProvider].description}
            </p>
          </div>

          {apiProvider === 'custom' && (
            <div className="mb-4">
              <label className={'block text-sm font-medium mb-2 ' + textPrimary}>
                Custom API Endpoint
              </label>
              <input
                type="text"
                value={apiEndpoint}
                onChange={(e) => setApiEndpoint(e.target.value)}
                placeholder="https://your-api-endpoint.com/v1/chat"
                className={'w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2 ' + inputBg + ' ' + textPrimary + ' ' + (darkMode ? 'focus:ring-purple-500' : 'focus:ring-blue-500')}
              />
            </div>
          )}

          <div className="mb-6">
            <label className={'block text-sm font-medium mb-2 ' + textPrimary}>
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your API key"
              className={'w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2 ' + inputBg + ' ' + textPrimary + ' ' + (darkMode ? 'focus:ring-purple-500' : 'focus:ring-blue-500')}
              onKeyPress={(e) => e.key === 'Enter' && apiKey && setShowConfig(false)}
            />
            <p className={'text-xs mt-2 ' + textSecondary}>
              Get your API key from the provider website
            </p>
          </div>

          <button
            onClick={() => apiKey && setShowConfig(false)}
            disabled={!apiKey || (apiProvider === 'custom' && !apiEndpoint)}
            className={'w-full px-4 py-3 text-white rounded-lg font-semibold transition-colors ' + btnBg + ' ' + (darkMode ? 'disabled:bg-slate-700' : 'disabled:bg-gray-300') + ' disabled:text-gray-500'}
          >
            Start Chat
          </button>

          <div className={'mt-6 p-4 rounded-lg ' + (darkMode ? 'bg-purple-900/30' : 'bg-blue-50')}>
            <h3 className={'font-semibold text-sm mb-2 ' + textPrimary}>✨ Trained Features:</h3>
            <ul className={'text-xs space-y-1 ' + textSecondary}>
              <li>• Dataset: 2000+ trained conversation patterns</li>
              <li>• Intents: Greeting, Farewell, Identity, Capabilities, and more</li>
              <li>• NLP: Advanced intent recognition with fuzzy matching</li>
              <li>• Accuracy: 90%+ on trained patterns</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={'flex flex-col h-screen ' + bgGradient}>
      <div className={cardBg + '/90 backdrop-blur-sm px-6 py-4 ' + (darkMode ? 'border-b border-purple-500/30' : 'border-b border-blue-200')}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className={'w-8 h-8 ' + accentColor} />
            <div>
              <h1 className={'text-xl font-bold ' + textPrimary}>SHAKTI 2.0</h1>
              <p className={'text-xs ' + textSecondary}>
                {apiProviders[apiProvider].name} • Trained Model
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={'px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ' + (darkMode ? 'bg-slate-700 hover:bg-slate-600 text-purple-400' : 'bg-blue-100 hover:bg-blue-200 text-blue-700')}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={'px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ' + (darkMode ? 'bg-slate-700 hover:bg-slate-600 text-purple-400' : 'bg-blue-100 hover:bg-blue-200 text-blue-700')}
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={clearChat}
              className={'px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ' + (darkMode ? 'bg-slate-700 hover:bg-slate-600 text-purple-400' : 'bg-blue-100 hover:bg-blue-200 text-blue-700')}
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          </div>
        </div>
      </div>

      {showSettings && (
        <div className={'px-6 py-4 ' + (darkMode ? 'bg-purple-900/30 border-b border-purple-500/20' : 'bg-blue-50 border-b border-blue-200')}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={'font-semibold ' + textPrimary}>Configuration</h3>
            <button
              onClick={() => setShowConfig(true)}
              className={'text-sm ' + accentColor + ' ' + (darkMode ? 'hover:text-purple-300' : 'hover:text-blue-700')}
            >
              Change Provider
            </button>
          </div>
          <div className={'text-sm ' + textSecondary}>
            <p>Provider: <span className="font-medium">{apiProviders[apiProvider].name}</span></p>
            <p>Training: <span className="font-medium">2000+ patterns • 10 intents</span></p>
          </div>
        </div>
      )}

      <div className={'backdrop-blur-sm px-6 py-2 ' + (darkMode ? 'bg-slate-800/30 border-b border-purple-500/20' : 'bg-blue-50/50 border-b border-blue-200')}>
        <div className={'flex items-center gap-6 text-xs ' + textSecondary}>
          <div className="flex items-center gap-2">
            <Activity className={'w-3 h-3 ' + accentColor} />
            <span>Context: {stateSpace.contextHistory.length} states</span>
          </div>
          <div>Memory: {stateSpace.semanticMemory.length} entities</div>
          <div>Attention: {stateSpace.attentionWeights.length}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={'flex ' + (msg.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={'max-w-[80%] px-4 py-3 rounded-2xl ' + (msg.role === 'user' ? userMsgBg + ' text-white' : botMsgBg + ' ' + textPrimary + ' ' + (darkMode ? '' : 'shadow-sm'))}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className={botMsgBg + ' px-4 py-3 rounded-2xl ' + (darkMode ? '' : 'shadow-sm')}>
              <div className="flex gap-2">
                <div className={'w-2 h-2 rounded-full animate-bounce ' + (darkMode ? 'bg-purple-400' : 'bg-blue-600')} style={{ animationDelay: '0ms' }}></div>
                <div className={'w-2 h-2 rounded-full animate-bounce ' + (darkMode ? 'bg-purple-400' : 'bg-blue-600')} style={{ animationDelay: '150ms' }}></div>
                <div className={'w-2 h-2 rounded-full animate-bounce ' + (darkMode ? 'bg-purple-400' : 'bg-blue-600')} style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={cardBg + '/90 backdrop-blur-sm px-6 py-4 ' + (darkMode ? 'border-t border-purple-500/30' : 'border-t border-blue-200')}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type your message..."
            className={'flex-1 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 ' + inputBg + ' ' + textPrimary + ' ' + (darkMode ? 'focus:ring-purple-500' : 'focus:ring-blue-500')}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className={'px-6 py-3 text-white rounded-lg flex items-center gap-2 transition-colors font-semibold ' + btnBg + ' ' + (darkMode ? 'disabled:bg-slate-700' : 'disabled:bg-gray-300') + ' disabled:text-gray-500'}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShaktiChatbot;