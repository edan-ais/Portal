import { useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function HomeTab() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! How can I help you manage your portal today?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm here to help you manage your portal efficiently. I can assist with tasks, events, leads, and more!",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col">
      <div className="mb-6">
        <h1 className="text-4xl font-bold text-gray-800 font-quicksand mb-2">
          Hi, David
        </h1>
        <p className="text-gray-600">How can I assist you today?</p>
      </div>

      <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2">
        {messages.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'glass-card text-gray-800'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-medium text-blue-600">Assistant</span>
                </div>
              )}
              <p className="whitespace-pre-wrap">{message.content}</p>
              <p
                className={`text-xs mt-2 ${
                  message.role === 'user' ? 'text-gray-700' : 'text-gray-500'
                }`}
              >
                {message.timestamp.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </motion.div>
        ))}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="glass-card rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-500" />
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100" />
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <div className="glass-card rounded-2xl p-4">
        <div className="flex gap-3 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            rows={1}
            className="flex-1 glass-input rounded-xl px-4 py-3 text-gray-800 placeholder-gray-400 focus:outline-none resize-none max-h-32"
          />
          <motion.button
            onClick={handleSend}
            disabled={!input.trim()}
            className="glass-button px-6 py-3 rounded-xl text-white font-quicksand font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            whileHover={{ scale: input.trim() ? 1.05 : 1 }}
            whileTap={{ scale: input.trim() ? 0.95 : 1 }}
          >
            <Send className="w-5 h-5" />
            Send
          </motion.button>
        </div>
      </div>
    </div>
  );
}
