import { useState } from 'react';
import { Mic, MicOff, Sparkles, X } from 'lucide-react';

interface VoiceLoggerProps {
  onParsedReading: (value: number, context: string, rawText: string) => void;
  onClose: () => void;
}

export function VoiceLogger({ onParsedReading, onClose }: VoiceLoggerProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [selectedLang, setSelectedLang] = useState<'mr-IN' | 'hi-IN' | 'en-IN'>('mr-IN');
  const [parseStatus, setParseStatus] = useState<string | null>(null);

  // Smart parser for spoken Marathi, Hindi, and English health phrases
  const parseSpeechText = (text: string) => {
    const lower = text.toLowerCase();
    let detectedContext = 'FASTING';

    if (
      lower.includes('post') ||
      lower.includes('meal') ||
      lower.includes('जेवणा नंतर') ||
      lower.includes('खाना खाने के बाद') ||
      lower.includes('nantar')
    ) {
      detectedContext = 'POST_MEAL_2HR';
    } else if (
      lower.includes('bedtime') ||
      lower.includes('झोपताना') ||
      lower.includes('सोते समय')
    ) {
      detectedContext = 'BEDTIME';
    } else if (
      lower.includes('fasting') ||
      lower.includes('उपाशीपोटी') ||
      lower.includes('खाली पेट') ||
      lower.includes('sakai') ||
      lower.includes('morning')
    ) {
      detectedContext = 'FASTING';
    }

    // Extract numbers from transcript
    const numbers = text.match(/\d+(\.\d+)?/g);
    if (numbers && numbers.length > 0) {
      const val = parseFloat(numbers[0]);
      if (val >= 30 && val <= 500) {
        setParseStatus(`Successfully parsed: ${val} mg/dL (${detectedContext.replace('_', ' ').toLowerCase()})`);
        setTimeout(() => {
          onParsedReading(val, detectedContext, text);
          onClose();
        }, 1200);
        return;
      }
    }
    setParseStatus('Could not detect a glucose value. Please try again clearly or enter the reading manually.');
  };

  const startListening = () => {
    setTranscript('');
    setParseStatus('Listening... Speak your reading in Marathi, Hindi, or English.');
    setIsListening(true);

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setParseStatus('Browser speech recognition is not supported. Please enter the reading manually.');
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = selectedLang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const speechText = event.results[0][0].transcript;
      setTranscript(speechText);
      parseSpeechText(speechText);
      setIsListening(false);
    };

    recognition.onerror = () => {
      setParseStatus('Microphone error or permission denied. Please enter the reading manually.');
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    try {
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700">
              <Sparkles className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Voice-to-Sugar Logging</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1"
            aria-label="Close voice logger"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-slate-600">
          Uses your browser microphone permission for speech recognition. Speak naturally in your preferred language.
        </p>

        {/* Language Selector */}
        <div className="flex gap-2">
          {[
            { id: 'mr-IN', label: 'मराठी (Marathi)' },
            { id: 'hi-IN', label: 'हिन्दी (Hindi)' },
            { id: 'en-IN', label: 'English' },
          ].map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setSelectedLang(l.id as any)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition ${
                selectedLang === l.id
                  ? 'bg-teal-50 text-teal-800 border-teal-300'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Microphone Button Area */}
        <div className="py-6 text-center space-y-3 bg-slate-50 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={startListening}
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white shadow-md transition ${
              isListening ? 'bg-rose-600 animate-pulse' : 'bg-teal-700 hover:bg-teal-800'
            }`}
            aria-label={isListening ? 'Listening for voice input' : 'Start microphone recording'}
          >
            {isListening ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
          </button>
          <p className="text-xs font-semibold text-slate-700">
            {isListening ? 'Listening... Speak now' : 'Tap mic to speak'}
          </p>
        </div>

        {transcript && (
          <div className="p-3 bg-slate-100 rounded-lg text-xs space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Spoken Transcript:</span>
            <p className="text-slate-800 italic">"{transcript}"</p>
          </div>
        )}

        {parseStatus && (
          <p className="text-xs font-semibold text-teal-800 text-center bg-teal-50 p-2.5 rounded-lg border border-teal-100">
            {parseStatus}
          </p>
        )}

      </div>
    </div>
  );
}
