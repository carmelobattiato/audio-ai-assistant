
import React, { useState, useRef, useEffect } from 'react';
import { Button } from './common/Button';
import { Input } from './common/Input';
import { ChatMessage, AppSettings, LlmUsageStats } from '../types';
import { llmService } from '../services/geminiService';
import { htmlToPlainText, markdownToHtmlSimple } from '../utils/textUtils';
import { SparklesIcon, TrashIcon, CheckCircleIcon } from '../constants';

interface CorrectionChatProps {
    isOpen: boolean;
    onClose: () => void;
    sourceText: string;
    llmResult: string;
    onUpdateSourceText: (newText: string) => void;
    onUpdateLlmResult: (newText: string) => void;
    llmSettings: AppSettings['llm'];
    onLlmUsage?: (stats: LlmUsageStats) => void;
}

export const CorrectionChat: React.FC<CorrectionChatProps> = ({
    isOpen,
    onClose,
    sourceText,
    llmResult,
    onUpdateSourceText,
    onUpdateLlmResult,
    llmSettings,
    onLlmUsage,
}) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [target, setTarget] = useState<'transcription' | 'llm_result'>('llm_result');
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    const handleSend = async () => {
        if (!inputValue.trim() || isTyping) return;

        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            text: inputValue,
            timestamp: Date.now(),
            target: target
        };

        setMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setIsTyping(true);

        const currentText = target === 'transcription' ? sourceText : llmResult;
        const plainText = htmlToPlainText(currentText);

        const systemInstruction = `You are a text editing assistant. You will receive an original text and a set of correction instructions from the user. 
Apply the instructions precisely to the text. 
If the instructions are simple replacements, do them globally throughout the text. 
If they are semantic corrections or rewrites, modify only the relevant parts while keeping the rest of the text identical to the original.
Your response MUST be the full, corrected version of the text. 
Do not include any conversational text like "Here is the modified text" or code blocks.
The language should be kept as the original text's language.
If the instructions are unclear, do your best to satisfy them based on the context.`;

        const prompt = `INSTRUCTION: "${userMsg.text}"\n\nTARGET TEXT:\n${plainText}`;

        try {
            const { text: correctedText, usageMetadata } = await llmService.generateText(prompt, llmSettings, systemInstruction);

            if (usageMetadata && onLlmUsage) {
                onLlmUsage({
                    functionName: 'Correction Chatbot',
                    inputTokens: usageMetadata.inputTokens,
                    outputTokens: usageMetadata.outputTokens,
                    model: llmSettings.model,
                    provider: llmSettings.provider,
                    timestamp: Date.now(),
                });
            }

            const assistantMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                text: correctedText || "Errore nella generazione della correzione.",
                timestamp: Date.now(),
            };

            setMessages(prev => [...prev, assistantMsg]);
        } catch (error) {
            console.error("CorrectionChat: Error processing instruction.", error);
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                text: "Si è verificato un errore durante la correzione. Riprova.",
                timestamp: Date.now()
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleApplyMessage = (msg: ChatMessage) => {
        if (msg.role !== 'assistant' || !msg.text) return;
        const htmlContent = markdownToHtmlSimple(msg.text);
        if (target === 'transcription') {
            onUpdateSourceText(htmlContent);
        } else {
            onUpdateLlmResult(htmlContent);
        }
    };

    const clearChat = () => {
        setMessages([]);
    };

    return (
        <div className={`chat-drawer ${isOpen ? 'open' : ''}`}>
            <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
                <div className="flex items-center gap-2">
                    <SparklesIcon className="w-6 h-6 text-sky-400" />
                    <h3 className="text-lg font-bold text-sky-400">Assistant Correzioni</h3>
                </div>
                <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <div className="p-3 bg-gray-900 border-b border-gray-700 flex gap-2">
                <button 
                    onClick={() => setTarget('llm_result')}
                    className={`flex-1 py-1 px-2 rounded text-xs transition-colors ${target === 'llm_result' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                >
                    Risultato LLM
                </button>
                <button 
                    onClick={() => setTarget('transcription')}
                    className={`flex-1 py-1 px-2 rounded text-xs transition-colors ${target === 'transcription' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                >
                    Trascrizione
                </button>
            </div>

            <div className="chat-messages scrollbar" ref={scrollRef}>
                {messages.length === 0 && (
                    <div className="text-center py-10 px-6 text-gray-500 italic text-sm">
                        Chiedimi di applicare correzioni al testo. Esempio: "Sostituisci Pluto con Pippo ovunque" o "Rendi l'ultimo paragrafo più formale".
                    </div>
                )}
                {messages.map(msg => (
                    <div key={msg.id} className={`chat-bubble ${msg.role}`}>
                        <div className="whitespace-pre-wrap">{msg.text}</div>
                        {msg.role === 'assistant' && msg.text && !msg.text.includes("errore") && (
                            <div className="mt-2 pt-2 border-t border-gray-600 flex justify-end">
                                <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    onClick={() => handleApplyMessage(msg)}
                                    leftIcon={<CheckCircleIcon className="w-4 h-4" />}
                                    className="text-emerald-400 hover:text-emerald-300"
                                >
                                    Applica al Testo
                                </Button>
                            </div>
                        )}
                        <div className="text-[10px] text-gray-400 mt-1 opacity-60 text-right">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                ))}
                {isTyping && (
                    <div className="chat-bubble assistant">
                        <div className="flex gap-1 items-center">
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '200ms' }}></span>
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '400ms' }}></span>
                        </div>
                    </div>
                )}
            </div>

            <div className="chat-input-area">
                <div className="flex gap-2 items-center">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={clearChat} 
                        disabled={messages.length === 0}
                        title="Pulisci chat"
                    >
                        <TrashIcon className="w-5 h-5 text-gray-500 hover:text-red-400" />
                    </Button>
                    <div className="flex-grow">
                        <Input 
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="Digita correzione..."
                            className="bg-gray-800 border-gray-700"
                        />
                    </div>
                    <Button 
                        variant="primary" 
                        size="sm" 
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isTyping}
                    >
                        Invia
                    </Button>
                </div>
            </div>
        </div>
    );
};
