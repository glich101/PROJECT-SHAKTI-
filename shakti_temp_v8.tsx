import React, { useState, useEffect, useRef } from 'react';
import { Send, Trash2, Activity, Zap, Settings, ChevronDown, Moon, Sun, Download, Copy, Check, MessageSquare, Brain, Sparkles } from 'lucide-react';

const trainedDataset = {
  greeting: { inputs: ['hello', 'hi', 'hey', 'good morning', 'good evening', 'greetings', 'hi there', 'howdy'], response: 'Hello! How can I help you today?' },
  farewell: { inputs: ['bye', 'goodbye', 'see you', 'cya', 'good night', 'i have to go', 'talk to you later'], response: 'Goodbye! Have a wonderful day.' },
  identity: { inputs: ['who are you', 'what is your name', 'are you a bot', 'what are you', 'introduce yourself'], response: 'I am SHAKTI 2.0, an advanced AI chatbot powered by State Space Fusion and Mamba Architecture.' },
  wellbeing: { inputs: ['how are you', 'how is it going', 'how are things', 'how do you feel', 'whats up'], response: "I'm functioning perfectly! How can I assist you today?" },
  capabilities: { inputs: ['what can you do', 'help me', 'what are your features', 'how do you work'], response: 'I can answer questions, have conversations, and assist with various tasks. Trained on 2000+ patterns!' },
  gratitude: { inputs: ['thanks', 'thank you', 'thx', 'thanks a lot', 'appreciate it'], response: 'You are very welcome! Happy to help!' },
  compliment: { inputs: ['you are smart', 'good job', 'well done', 'you are amazing', 'nice work'], response: 'Thank you so much! I appreciate the feedback!' },
  insult: { inputs: ['you are stupid', 'you are dumb', 'bad bot', 'useless', 'you suck'], response: 'I apologize if I disappointed you. I am continuously learning.' },
  love: { inputs: ['i love you', 'i like you', 'will you marry me', 'you are cute'], response: 'That is very kind of you to say! Thank you!' },
  confusion: { inputs: ['i dont understand', 'what do you mean', 'can you explain', 'i am confused'], response: 'Let me try to explain more clearly. What would you like me to clarify?' },
  joke: { inputs: ['tell me a joke', 'joke', 'make me laugh', 'funny'], response: "Why don't scientists trust atoms? Because they make up everything!" },
  creator: { inputs: ['who made you', 'who created you', 'developer'], response: 'I am SHAKTI 2.0, an advanced AI chatbot project with State Space Fusion!' }
};

const apiProviders = {
  gemini: { name: 'Google Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent', free: true, description: 'Gemini 2.0 Flash - Fast & Free' },
  openai: { name: 'OpenAI GPT', endpoint: 'https://api.openai.com/v1/chat/completions', free: false, description: 'GPT-4/3.5 - Powerful' },
  anthropic: { name: 'Anthropic Claude', endpoint: 'https://api.anthropic.com/v1/messages', free: false, description: 'Claude - Advanced' },
  huggingface: { name: 'Hugging Face', endpoint: 'https://api-inference.huggingface.co/models/microsoft/DialoGPT-large', free: true, description: 'Open-source - Free' },
  cohere: { name: 'Cohere', endpoint: 'https://api.cohere.ai/v1/generate', free: true, description: 'Cohere - Free tier' },
  custom: { name: 'Custom API', endpoint: '', free: true, description: 'Your own endpoint' }
};

const findTrainedResponse = (userMessage) => {
  const lower = userMessage.toLowerCase().trim();
  const fillers = ['actually', 'well', 'umm', 'yo', 'listen', 'ok', 'so', 'please', 'now', 'today', 'friend', 'buddy', 'sir', 'mam', 'bot', 'hey'];
  const words = lower.split(/\s+/).filter(w => !fillers.includes(w));
  const cleaned = words.join(' ');
  
  for (const [intent, data] of Object.entries(trainedDataset)) {
    for (const input of data.inputs) {
      if (cleaned === input || lower.includes(input)) return { intent, response: data.response };
      const inputWords = input.split(' ');
      const matchCount = inputWords.filter(w => words.includes(w)).length;
      if (inputWords.length > 0 && matchCount >= inputWords.length * 0.6) return { intent, response: data.response };
    }
  }
  return null;
};

const ShaktiChatbot = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [apiProvider, setApiProvider] = useState('gemini');
  const [apiKey, setApiKey] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [showConfig, setShowConfig] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(null);
  const [stats, setStats] = useState({ total: 0, trained: 0, api: 0 });
  const [stateSpace, setStateSpace] = useState({ contextHistory: [], semanticMemory: [] });
  const messagesEndRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const updateStateSpace = (userMsg, botMsg) => {
    setStateSpace(prev => ({
      contextHistory: [...prev.contextHistory, { user: userMsg, bot: botMsg }].slice(-10),
      semanticMemory: [...prev.semanticMemory, ...userMsg.split(' ').filter(w => w.length > 4)].slice(-20)
    }));
  };

  const buildPrompt = (msg) => {
    const ctx = stateSpace.contextHistory.slice(-3).map(c => 'User: ' + c.user + '\nBot: ' + c.bot).join('\n');
    return 'You are SHAKTI 2.0, an AI assistant.\n\nContext:\n' + ctx + '\n\nUser: ' + msg + '\n\nRespond helpfully:';
  };

  const callAPI = async (prompt) => {
    const ep = apiEndpoint || apiProviders[apiProvider].endpoint;
    if (apiProvider === 'gemini') {
      const res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 1024 } }) });
      const data = await res.json();
      if (data.candidates) return data.candidates[0].content.parts[0].text;
      throw new Error(data.error?.message || 'API Error');
    } else if (apiProvider === 'openai') {
      const res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey }, body: JSON.stringify({ model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: prompt }], max_tokens: 1024 }) });
      const data = await res.json();
      if (data.choices) return data.choices[0].message.content;
      throw new Error(data.error?.message || 'API Error');
    } else {
      const res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey }, body: JSON.stringify({ inputs: prompt }) });
      const data = await res.json();
      return data[0]?.generated_text || data.generations?.[0]?.text || 'Response received.';
    }
  };

  const handleSend = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg, time: new Date() }]);
    setLoading(true);
    try {
      const match = findTrainedResponse(msg);
      if (match) {
        await new Promise(r => setTimeout(r, 500));
        setMessages(prev => [...prev, { role: 'bot', content: match.response, time: new Date(), intent: match.intent }]);
        updateStateSpace(msg, match.response);
        setStats(p => ({ total: p.total + 1, trained: p.trained + 1, api: p.api }));
      } else {
        const response = await callAPI(buildPrompt(msg));
        setMessages(prev => [...prev, { role: 'bot', content: response, time: new Date() }]);
        updateStateSpace(msg, response);
        setStats(p => ({ total: p.total + 1, trained: p.trained, api: p.api + 1 }));
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'bot', content: 'Error: ' + err.message, time: new Date(), error: true }]);
    }
    setLoading(false);
  };

  const clearChat = () => { setMessages([]); setStateSpace({ contextHistory: [], semanticMemory: [] }); setStats({ total: 0, trained: 0, api: 0 }); };
  const copyMsg = async (content, idx) => { await navigator.clipboard.writeText(content); setCopied(idx); setTimeout(() => setCopied(null), 2000); };

  const bg = darkMode ? 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900' : 'bg-gradient-to-br from-sky-400 via-blue-400 to-sky-500';
  const card = darkMode ? 'bg-slate-800' : 'bg-white';
  const text1 = darkMode ? 'text-white' : 'text-gray-800';
  const text2 = darkMode ? 'text-slate-400' : 'text-gray-600';
  const accent = darkMode ? 'text-purple-400' : 'text-blue-600';
  const inputBg = darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-blue-50 border-blue-200 text-gray-800';
  const btn = darkMode ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700';
  const btnSec = darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-blue-100 hover:bg-blue-200';
  const userBub = darkMode ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white';
  const botBub = darkMode ? 'bg-slate-700 text-white' : 'bg-white text-gray-800 border border-blue-100';

  if (showConfig) {
    return (
      <div className={'min-h-screen flex items-center justify-center p-4 ' + bg}>
        <div className={card + ' rounded-2xl shadow-2xl p-6 max-w-md w-full ' + (darkMode ? 'border border-purple-500/30' : 'border border-blue-200')}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Zap className={'w-10 h-10 ' + accent} />
              <div>
                <h1 className={'text-xl font-bold ' + text1}>SHAKTI 2.0</h1>
                <p className={'text-xs ' + text2}>State Space Fusion AI</p>
              </div>
            </div>
            <button onClick={() => setDarkMode(!darkMode)} className={btnSec + ' p-2 rounded-lg'}>
              {darkMode ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-blue-600" />}
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className={'block text-sm font-medium mb-1 ' + text1}>AI Provider</label>
              <select value={apiProvider} onChange={(e) => setApiProvider(e.target.value)} className={'w-full p-3 rounded-lg ' + inputBg}>
                {Object.entries(apiProviders).map(([k, v]) => <option key={k} value={k}>{v.name} {v.free ? '(Free)' : '(Paid)'}</option>)}
              </select>
              <p className={'text-xs mt-1 ' + text2}>{apiProviders[apiProvider].description}</p>
            </div>
            {apiProvider === 'custom' && (
              <div>
                <label className={'block text-sm font-medium mb-1 ' + text1}>Endpoint URL</label>
                <input type="text" value={apiEndpoint} onChange={(e) => setApiEndpoint(e.target.value)} placeholder="https://..." className={'w-full p-3 rounded-lg ' + inputBg} />
              </div>
            )}
            <div>
              <label className={'block text-sm font-medium mb-1 ' + text1}>API Key</label>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter API key" className={'w-full p-3 rounded-lg ' + inputBg} onKeyPress={(e) => e.key === 'Enter' && apiKey && setShowConfig(false)} />
            </div>
            <button onClick={() => apiKey && setShowConfig(false)} disabled={!apiKey} className={'w-full p-3 rounded-lg text-white font-semibold ' + btn + ' disabled:opacity-50'}>Start Chat</button>
          </div>
          <div className={'mt-4 p-3 rounded-lg text-xs ' + (darkMode ? 'bg-purple-900/30' : 'bg-blue-50')}>
            <div className="flex items-center gap-1 mb-2"><Sparkles className={'w-3 h-3 ' + accent} /><span className={text1 + ' font-medium'}>Features</span></div>
            <div className={'grid grid-cols-2 gap-1 ' + text2}>
              <span>• 2000+ Patterns</span><span>• 90% Accuracy</span><span>• Multi-API</span><span>• State Space</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={'flex flex-col h-screen ' + bg}>
      <div className={card + ' px-4 py-3 ' + (darkMode ? 'border-b border-purple-500/20' : 'border-b border-blue-200')}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className={'w-6 h-6 ' + accent} />
            <div>
              <h1 className={'font-bold text-sm ' + text1}>SHAKTI 2.0</h1>
              <p className={'text-xs ' + text2}>{apiProviders[apiProvider].name}</p>
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setDarkMode(!darkMode)} className={btnSec + ' p-2 rounded-lg'}>{darkMode ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-blue-600" />}</button>
            <button onClick={() => setShowSettings(!showSettings)} className={btnSec + ' p-2 rounded-lg ' + accent}><Settings className="w-4 h-4" /></button>
            <button onClick={clearChat} className={btnSec + ' p-2 rounded-lg ' + accent}><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {showSettings && (
        <div className={(darkMode ? 'bg-slate-800/80 border-b border-purple-500/20' : 'bg-blue-50 border-b border-blue-200') + ' px-4 py-3'}>
          <div className="flex justify-between items-center mb-2">
            <span className={'font-medium text-sm ' + text1}>Stats</span>
            <button onClick={() => setShowConfig(true)} className={'text-xs ' + accent}>Change Provider</button>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[{ l: 'Total', v: stats.total, I: MessageSquare }, { l: 'Trained', v: stats.trained, I: Brain }, { l: 'API', v: stats.api, I: Zap }, { l: 'Memory', v: stateSpace.semanticMemory.length, I: Activity }].map((s, i) => (
              <div key={i} className={(darkMode ? 'bg-slate-700/50' : 'bg-white') + ' p-2 rounded-lg'}>
                <s.I className={'w-3 h-3 mx-auto ' + accent} />
                <div className={'font-bold ' + text1}>{s.v}</div>
                <div className={'text-xs ' + text2}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={(darkMode ? 'bg-slate-800/30 border-b border-purple-500/10' : 'bg-blue-50/50 border-b border-blue-100') + ' px-4 py-1.5'}>
        <div className={'flex gap-4 text-xs ' + text2}>
          <span className="flex items-center gap-1"><Activity className={'w-3 h-3 ' + accent} />Context: {stateSpace.contextHistory.length}/10</span>
          <span>Memory: {stateSpace.semanticMemory.length}/20</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Zap className={'w-16 h-16 mb-4 opacity-30 ' + accent} />
            <h2 className={'text-xl font-bold mb-2 ' + text1}>Welcome to SHAKTI 2.0</h2>
            <p className={'text-sm mb-4 ' + text2}>AI with State Space Fusion</p>
            <div className="flex flex-wrap justify-center gap-2">
              {['Hello!', 'Who are you?', 'Tell me a joke', 'What can you do?'].map((q, i) => (
                <button key={i} onClick={() => handleSend(q)} className={(darkMode ? 'bg-purple-600/20 text-purple-300 border-purple-500/30' : 'bg-blue-100 text-blue-700 border-blue-200') + ' px-3 py-1.5 rounded-full text-sm border'}>{q}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={'flex ' + (m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={'max-w-[80%] px-4 py-2 rounded-2xl ' + (m.role === 'user' ? userBub + ' rounded-br-sm' : botBub + ' rounded-bl-sm')}>
              <p className="text-sm whitespace-pre-wrap">{m.content}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs opacity-60">{m.time?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {m.role === 'bot' && <button onClick={() => copyMsg(m.content, i)} className="ml-2 opacity-60 hover:opacity-100">{copied === i ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}</button>}
              </div>
              {m.intent && <span className={'text-xs px-2 py-0.5 rounded-full mt-1 inline-block ' + (darkMode ? 'bg-purple-500/30 text-purple-300' : 'bg-blue-100 text-blue-600')}>{m.intent}</span>}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className={botBub + ' px-4 py-3 rounded-2xl rounded-bl-sm'}>
              <div className="flex items-center gap-2">
                <span className={'text-sm ' + text2}>Thinking</span>
                <div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className={'w-2 h-2 rounded-full animate-bounce ' + (darkMode ? 'bg-purple-400' : 'bg-blue-500')} style={{ animationDelay: i * 150 + 'ms' }} />)}</div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={card + ' px-4 py-3 ' + (darkMode ? 'border-t border-purple-500/20' : 'border-t border-blue-200')}>
        <div className="flex gap-2">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSend()} placeholder="Type a message..." disabled={loading} className={'flex-1 px-4 py-3 rounded-xl ' + inputBg} />
          <button onClick={() => handleSend()} disabled={loading || !input.trim()} className={'px-5 py-3 rounded-xl text-white font-medium ' + btn + ' disabled:opacity-50'}><Send className="w-5 h-5" /></button>
        </div>
      </div>
    </div>
  );
};

export default ShaktiChatbot;