import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';
import { Play, RotateCcw, Trash2, AlertCircle, Sparkles, Save, Upload, History, Activity, Wallet, Settings2 } from 'lucide-react';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type Outcome = 'Banker' | 'Player' | 'Tie';
type BettingStrategy = 'Flat' | 'Martingale' | 'Paroli' | 'Fibonacci';

interface PredictionResult {
  prediction: Outcome;
  confidence: number;
  reasoning: string;
}

export default function App() {
  const [history, setHistory] = useState<Outcome[]>([]);
  const [historicalShoes, setHistoricalShoes] = useState<Outcome[][]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [isPredicting, setIsPredicting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ 
    wins: 0, 
    losses: 0, 
    pushes: 0,
    currentStreakType: null as 'W' | 'L' | 'P' | null,
    currentStreakCount: 0,
    maxWinStreak: 0,
    maxLossStreak: 0
  });
  const [bankroll, setBankroll] = useState(10000);
  const [baseUnit, setBaseUnit] = useState(100);
  const [strategy, setStrategy] = useState<BettingStrategy>('Flat');
  const [currentBet, setCurrentBet] = useState(100);
  const [fibIndex, setFibIndex] = useState(1);
  const [paroliWins, setParoliWins] = useState(0);
  const [showBankrollSettings, setShowBankrollSettings] = useState(false);
  const [apiProvider, setApiProvider] = useState<'gemini' | 'custom'>('gemini');
  const [customApiKey, setCustomApiKey] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('https://openrouter.ai/api/v1/chat/completions');
  const [customModel, setCustomModel] = useState('anthropic/claude-3.5-sonnet');
  const [aiModel, setAiModel] = useState('gemini-3-flash-preview');
  const [customInstructions, setCustomInstructions] = useState('');
  const [showAISettings, setShowAISettings] = useState(false);
  const [turboMode, setTurboMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentBet(baseUnit);
    setFibIndex(1);
    setParoliWins(0);
  }, [strategy, baseUnit]);

  // Auto-scroll to right when history updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [history]);

  const addOutcome = (outcome: Outcome) => {
    if (prediction) {
      let resultType: 'W' | 'L' | 'P';
      if (prediction.prediction === outcome) {
        resultType = 'W';
      } else if (outcome === 'Tie' && prediction.prediction !== 'Tie') {
        resultType = 'P';
      } else {
        resultType = 'L';
      }

      // Bankroll logic
      let profit = 0;
      if (resultType === 'W') {
        if (prediction.prediction === 'Banker') profit = currentBet; // No Commission (1:1)
        else if (prediction.prediction === 'Player') profit = currentBet;
        else if (prediction.prediction === 'Tie') profit = currentBet * 8;
      } else if (resultType === 'L') {
        profit = -currentBet;
      }

      const newBankroll = bankroll + profit;
      setBankroll(newBankroll);

      if (resultType !== 'P') {
        let nextBet = baseUnit;
        let nextFib = fibIndex;
        let nextParoli = paroliWins;

        if (strategy === 'Martingale') {
          nextBet = resultType === 'W' ? baseUnit : currentBet * 2;
        } else if (strategy === 'Paroli') {
          if (resultType === 'W') {
            nextParoli = paroliWins + 1;
            if (nextParoli >= 3) {
              nextBet = baseUnit;
              nextParoli = 0;
            } else {
              nextBet = currentBet * 2;
            }
          } else {
            nextBet = baseUnit;
            nextParoli = 0;
          }
        } else if (strategy === 'Fibonacci') {
          const fibSeq = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987];
          if (resultType === 'W') {
            nextFib = Math.max(0, fibIndex - 2);
          } else {
            nextFib = Math.min(fibSeq.length - 1, fibIndex + 1);
          }
          nextBet = baseUnit * fibSeq[nextFib];
        }

        // Cap the next bet at the new bankroll to prevent betting more than we have
        nextBet = Math.min(nextBet, newBankroll);
        nextBet = Math.max(0, nextBet); // Prevent negative bets

        setCurrentBet(nextBet);
        setFibIndex(nextFib);
        setParoliWins(nextParoli);
      }

      setStats(prev => {
        const newStreakType = resultType === 'P' ? prev.currentStreakType : resultType;
        const newStreakCount = resultType === 'P' 
          ? prev.currentStreakCount 
          : (prev.currentStreakType === resultType ? prev.currentStreakCount + 1 : 1);

        return {
          ...prev,
          wins: resultType === 'W' ? prev.wins + 1 : prev.wins,
          losses: resultType === 'L' ? prev.losses + 1 : prev.losses,
          pushes: resultType === 'P' ? prev.pushes + 1 : prev.pushes,
          currentStreakType: newStreakType,
          currentStreakCount: newStreakCount,
          maxWinStreak: resultType === 'W' ? Math.max(prev.maxWinStreak, newStreakCount) : prev.maxWinStreak,
          maxLossStreak: resultType === 'L' ? Math.max(prev.maxLossStreak, newStreakCount) : prev.maxLossStreak
        };
      });
    }
    setHistory((prev) => [...prev, outcome]);
    setPrediction(null); // Clear previous prediction
    setError(null);
  };

  const undoLast = () => {
    setHistory((prev) => prev.slice(0, -1));
    setPrediction(null);
    setError(null);
  };

  const clearHistory = () => {
    setHistory([]);
    setPrediction(null);
    setError(null);
  };

  const saveShoe = () => {
    if (history.length > 0) {
      setHistoricalShoes((prev) => [...prev, history]);
      setHistory([]);
      setPrediction(null);
      setError(null);
    }
  };

  const handleImport = () => {
    const charMap: Record<string, Outcome> = { 'B': 'Banker', 'P': 'Player', 'T': 'Tie' };
    const parsed: Outcome[] = [];
    for (const char of importText.toUpperCase()) {
      if (charMap[char]) parsed.push(charMap[char]);
    }
    if (parsed.length > 0) {
      setHistoricalShoes((prev) => [...prev, parsed]);
      setImportText('');
      setIsImporting(false);
      setError(null);
    } else {
      setError('No valid outcomes found in import text. Use B, P, or T.');
    }
  };

  const clearHistoricalShoes = () => {
    setHistoricalShoes([]);
  };

  const handlePredict = async () => {
    if (history.length < 3) {
      setError('Please enter at least 3 outcomes for a meaningful prediction.');
      return;
    }
    if (prediction) return;

    setIsPredicting(true);
    setError(null);

    try {
      const historicalContext = historicalShoes.length > 0 
        ? `\nHistorical Reference Shoes (for meta-pattern analysis):\n${historicalShoes.map((shoe, i) => `Shoe ${i + 1}: ${shoe.join(', ')}`).join('\n')}\n`
        : '';

      const prompt = turboMode
        ? `Baccarat history: ${history.join(', ')}. Predict next (Banker/Player/Tie), confidence (0-100), and max 15 words reasoning.${customInstructions ? ` Rule: ${customInstructions}` : ''}`
        : `
        You are an elite Baccarat AI prediction bot with deep knowledge of statistical probabilities and advanced Baccarat road analysis (Big Road, Big Eye Boy, Small Road, Cockroach Pig).
        Analyze the following sequence of past outcomes from a Baccarat game (the bead map history).
        ${historicalContext}
        Perform a sophisticated pattern analysis:
        1. Macro-Trend Analysis: Evaluate the overall shoe bias (Banker vs. Player dominance, Tie frequency).
        2. Micro-Trend Analysis: Examine the most recent 5-10 hands for immediate momentum (e.g., streaks, chops, alternating patterns, ping-pong).
        3. Derived Road Inference: Mentally construct the derived roads to spot deeper, hidden symmetries or chaotic disruptions.
        4. Historical Context: If historical reference shoes are provided, compare the current shoe's trajectory against them. Do similar macro-patterns repeat? Weight your current prediction against historical performance.
        
        Based on this rigorous analysis, predict the most statistically likely next outcome (Banker, Player, or Tie).
        Provide a realistic confidence level (percentage from 0 to 100), keeping in mind the inherent house edge and variance in Baccarat.
        Provide a detailed but concise reasoning for your prediction, explaining the specific patterns and trends that led to this conclusion.

        Current Shoe History (oldest to newest, ${history.length} hands): ${history.join(', ')}
        
        ${customInstructions ? `\nCRITICAL CUSTOM INSTRUCTIONS FROM USER:\n${customInstructions}\n` : ''}
      `;

      let resultText = '';

      if (apiProvider === 'gemini') {
        const response = await ai.models.generateContent({
          model: aiModel,
          contents: prompt,
          config: {
            maxOutputTokens: turboMode ? 100 : undefined,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                prediction: {
                  type: Type.STRING,
                  description: "The predicted next outcome: 'Banker', 'Player', or 'Tie'.",
                  enum: ['Banker', 'Player', 'Tie']
                },
                confidence: {
                  type: Type.NUMBER,
                  description: "Confidence level percentage (0-100)."
                },
                reasoning: {
                  type: Type.STRING,
                  description: "Brief explanation of the pattern identified and why this prediction was made."
                }
              },
              required: ['prediction', 'confidence', 'reasoning']
            }
          }
        });
        resultText = response.text || '';
      } else {
        if (!customApiKey) throw new Error('Please enter your custom API key in AI Settings.');
        
        const customPrompt = prompt + '\n\nIMPORTANT: You MUST respond with ONLY a valid JSON object with exactly these keys: "prediction" (Banker, Player, or Tie), "confidence" (number 0-100), and "reasoning" (string). Do not include markdown formatting like ```json.';
        
        let response;
        try {
          response = await fetch(customBaseUrl.trim(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${customApiKey.trim()}`,
              'HTTP-Referer': window.location.href,
              'X-Title': 'Baccarat AI Predictor'
            },
            body: JSON.stringify({
              model: customModel.trim(),
              messages: [{ role: 'user', content: customPrompt }],
              max_tokens: turboMode ? 100 : undefined
            })
          });
        } catch (err: any) {
          throw new Error('Network Error (Failed to fetch). Please check your Base URL, ensure your API key is valid, and disable any ad-blockers or strict privacy shields (like Brave Shields) that might block API requests.');
        }

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        resultText = data.choices?.[0]?.message?.content || '';
        resultText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
      }

      if (resultText) {
        const result = JSON.parse(resultText) as PredictionResult;
        setPrediction(result);
      } else {
        throw new Error('No response from AI.');
      }
    } catch (err: any) {
      console.error('Prediction error:', err);
      setError(err.message || 'Failed to generate prediction. Please try again.');
    } finally {
      setIsPredicting(false);
    }
  };

  // Render bead map grid (6 rows, dynamic columns)
  // Bead plate fills top to bottom, then left to right.
  const rows = 6;
  const cols = Math.max(12, Math.ceil(history.length / rows) + 1);
  const grid: (Outcome | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));

  history.forEach((outcome, index) => {
    const col = Math.floor(index / rows);
    const row = index % rows;
    grid[row][col] = outcome;
  });

  // Calculate Streaks and Stats
  const currentStreakOutcome = history.length > 0 ? history[history.length - 1] : null;
  let currentStreakCount = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i] === currentStreakOutcome) {
      currentStreakCount++;
    } else {
      break;
    }
  }

  const maxStreaks = { Banker: 0, Player: 0, Tie: 0 };
  const counts = { Banker: 0, Player: 0, Tie: 0 };
  let tempOutcome: Outcome | null = null;
  let tempCount = 0;
  
  history.forEach(outcome => {
    counts[outcome]++;
    if (outcome === tempOutcome) {
      tempCount++;
    } else {
      tempOutcome = outcome;
      tempCount = 1;
    }
    if (tempCount > maxStreaks[outcome]) {
      maxStreaks[outcome] = tempCount;
    }
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500/30">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
        
        {/* Header */}
        <header className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
              <Sparkles className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Baccarat AI Predictor</h1>
              <p className="text-sm text-zinc-400 mt-1">Analyze bead map patterns to predict the next hand</p>
            </div>
          </div>
          
          {/* Scoreboard */}
          <div className="flex flex-wrap items-center justify-center bg-zinc-900/50 border border-zinc-800 rounded-xl p-1.5 shadow-sm divide-x divide-zinc-800/50">
            <div className="text-center px-3 sm:px-4 py-1">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-0.5">Wins</div>
              <div className="text-lg font-bold text-emerald-400 leading-none">{stats.wins}</div>
            </div>
            <div className="text-center px-3 sm:px-4 py-1">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-0.5">Losses</div>
              <div className="text-lg font-bold text-red-400 leading-none">{stats.losses}</div>
            </div>
            <div className="text-center px-3 sm:px-4 py-1 hidden sm:block">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-0.5">Pushes</div>
              <div className="text-lg font-bold text-zinc-400 leading-none">{stats.pushes}</div>
            </div>
            <div className="text-center px-3 sm:px-4 py-1">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-0.5">Win Rate</div>
              <div className="text-lg font-bold text-indigo-400 leading-none">
                {stats.wins + stats.losses > 0 ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100) : 0}%
              </div>
            </div>
            <div className="text-center px-3 sm:px-4 py-1">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-0.5">Streak</div>
              <div className={`text-lg font-bold leading-none ${stats.currentStreakType === 'W' ? 'text-emerald-400' : stats.currentStreakType === 'L' ? 'text-red-400' : 'text-zinc-400'}`}>
                {stats.currentStreakCount > 0 ? `${stats.currentStreakType}${stats.currentStreakCount}` : '-'}
              </div>
            </div>
            <div className="text-center px-3 sm:px-4 py-1 hidden sm:block">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-0.5">Max W/L</div>
              <div className="text-lg font-bold leading-none">
                <span className="text-emerald-400">{stats.maxWinStreak}</span>
                <span className="text-zinc-600 mx-1">/</span>
                <span className="text-red-400">{stats.maxLossStreak}</span>
              </div>
            </div>
            <div className="px-2 py-1 flex items-center justify-center">
              <button 
                onClick={() => setStats({wins: 0, losses: 0, pushes: 0, currentStreakType: null, currentStreakCount: 0, maxWinStreak: 0, maxLossStreak: 0})}
                className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors rounded-md hover:bg-zinc-800"
                title="Reset Counters"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Bead Map & Controls */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Bead Map Display */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">Bead Plate History</h2>
                <span className="text-xs text-zinc-500 font-mono">{history.length} hands recorded</span>
              </div>
              
              <div 
                ref={scrollRef}
                className="overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
              >
                <div 
                  className="grid gap-1"
                  style={{ 
                    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                    width: `${cols * 2.5}rem`
                  }}
                >
                  {grid.map((row, rowIndex) => (
                    row.map((cell, colIndex) => (
                      <div 
                        key={`${rowIndex}-${colIndex}`}
                        className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs font-bold border border-zinc-800/50 bg-zinc-950/50"
                      >
                        {cell && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className={`w-full h-full rounded-full flex items-center justify-center shadow-inner
                              ${cell === 'Banker' ? 'bg-red-500 text-white shadow-red-900/50' : 
                                cell === 'Player' ? 'bg-blue-500 text-white shadow-blue-900/50' : 
                                'bg-emerald-500 text-white shadow-emerald-900/50'}`}
                          >
                            {cell.charAt(0)}
                          </motion.div>
                        )}
                      </div>
                    ))
                  ))}
                </div>
              </div>

              {/* Shoe Statistics Footer */}
              {history.length > 0 && (
                <div className="mt-5 pt-5 border-t border-zinc-800/50 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Activity className="w-3 h-3" /> Current Streak
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        currentStreakOutcome === 'Banker' ? 'bg-red-500' : 
                        currentStreakOutcome === 'Player' ? 'bg-blue-500' : 'bg-emerald-500'
                      }`} />
                      <span className="text-sm font-medium text-zinc-300">
                        {currentStreakOutcome} <span className="text-zinc-500 ml-1">x{currentStreakCount}</span>
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Max Banker</div>
                    <div className="text-sm font-medium text-red-400">{maxStreaks.Banker} <span className="text-zinc-600 text-xs ml-1">({counts.Banker} total)</span></div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Max Player</div>
                    <div className="text-sm font-medium text-blue-400">{maxStreaks.Player} <span className="text-zinc-600 text-xs ml-1">({counts.Player} total)</span></div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Max Tie</div>
                    <div className="text-sm font-medium text-emerald-400">{maxStreaks.Tie} <span className="text-zinc-600 text-xs ml-1">({counts.Tie} total)</span></div>
                  </div>
                </div>
              )}
            </div>

            {/* Bankroll Management */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  Bankroll Management
                </h2>
                <button 
                  onClick={() => setShowBankrollSettings(!showBankrollSettings)}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-950 border border-zinc-800/50 rounded-xl p-3">
                  <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Current Balance</div>
                  <div className={`text-xl font-bold ${bankroll >= 10000 ? 'text-emerald-400' : 'text-red-400'}`}>
                    ₱{bankroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800/50 rounded-xl p-3">
                  <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Next Bet ({strategy})</div>
                  <div className="text-xl font-bold text-indigo-400">
                    ₱{currentBet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {showBankrollSettings && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-4 pt-4 mt-4 border-t border-zinc-800/50">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Set Bankroll (₱)</label>
                          <input 
                            type="number" 
                            value={bankroll}
                            onChange={(e) => setBankroll(Number(e.target.value))}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Base Unit (₱)</label>
                          <input 
                            type="number" 
                            value={baseUnit}
                            onChange={(e) => setBaseUnit(Number(e.target.value))}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Betting Strategy</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {['Flat', 'Martingale', 'Paroli', 'Fibonacci'].map(s => (
                            <button
                              key={s}
                              onClick={() => setStrategy(s as BettingStrategy)}
                              className={`py-2 px-3 rounded-lg text-xs font-medium transition-colors border ${
                                strategy === s 
                                  ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' 
                                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                              }`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Input Controls */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider mb-4">Record Hand</h2>
              
              <div className="grid grid-cols-3 gap-3 mb-6">
                <button
                  onClick={() => addOutcome('Banker')}
                  className="flex flex-col items-center justify-center py-4 px-2 bg-zinc-950 border border-red-500/30 rounded-xl hover:bg-red-500/10 hover:border-red-500/50 transition-all group"
                >
                  <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white font-bold mb-2 shadow-lg shadow-red-500/20 group-hover:scale-110 transition-transform">B</div>
                  <span className="text-sm font-medium text-red-400">Banker</span>
                </button>
                
                <button
                  onClick={() => addOutcome('Player')}
                  className="flex flex-col items-center justify-center py-4 px-2 bg-zinc-950 border border-blue-500/30 rounded-xl hover:bg-blue-500/10 hover:border-blue-500/50 transition-all group"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold mb-2 shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform">P</div>
                  <span className="text-sm font-medium text-blue-400">Player</span>
                </button>
                
                <button
                  onClick={() => addOutcome('Tie')}
                  className="flex flex-col items-center justify-center py-4 px-2 bg-zinc-950 border border-emerald-500/30 rounded-xl hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all group"
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold mb-2 shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform">T</div>
                  <span className="text-sm font-medium text-emerald-400">Tie</span>
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={undoLast}
                  disabled={history.length === 0}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 rounded-lg text-sm font-medium transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Undo Last
                </button>
                <button
                  onClick={clearHistory}
                  disabled={history.length === 0}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-zinc-800 hover:bg-red-900/30 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 rounded-lg text-sm font-medium transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All
                </button>
              </div>
            </div>

            {/* Historical Reference */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Historical Reference
                </h2>
                <span className="text-xs text-zinc-500 font-mono">{historicalShoes.length} shoes saved</span>
              </div>

              {isImporting ? (
                <div className="space-y-3">
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder="Paste outcomes (e.g., B P B T P P)..."
                    className="w-full h-24 bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleImport}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Import
                    </button>
                    <button
                      onClick={() => setIsImporting(false)}
                      className="px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={saveShoe}
                    disabled={history.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    Save Current Shoe
                  </button>
                  <button
                    onClick={() => setIsImporting(true)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Import History
                  </button>
                  {historicalShoes.length > 0 && (
                    <button
                      onClick={clearHistoricalShoes}
                      className="flex items-center justify-center gap-2 py-2.5 px-4 bg-zinc-800 hover:bg-red-900/30 hover:text-red-400 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
                      title="Clear Historical Shoes"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Prediction */}
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">AI Analysis</h2>
                <button 
                  onClick={() => setShowAISettings(!showAISettings)}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                  title="AI Settings"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
              </div>

              <AnimatePresence>
                {showAISettings && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden mb-4"
                  >
                    <div className="space-y-4 p-4 bg-zinc-950 border border-zinc-800/50 rounded-xl">
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5">API Provider</label>
                        <select 
                          value={apiProvider}
                          onChange={(e) => setApiProvider(e.target.value as 'gemini' | 'custom')}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50"
                        >
                          <option value="gemini">Google Gemini (Default)</option>
                          <option value="custom">Custom (OpenRouter, OpenAI, etc.)</option>
                        </select>
                      </div>

                      {apiProvider === 'gemini' ? (
                        <div>
                          <label className="block text-xs font-medium text-zinc-400 mb-1.5">AI Model</label>
                          <select 
                            value={aiModel}
                            onChange={(e) => setAiModel(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50"
                          >
                            <option value="gemini-3-flash-preview">Gemini 3 Flash (Fast)</option>
                            <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Advanced)</option>
                            <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite (Lite)</option>
                          </select>
                        </div>
                      ) : (
                        <div className="space-y-3 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
                          <div className="text-xs text-zinc-400 mb-2 bg-indigo-500/10 p-3 rounded-lg border border-indigo-500/20 leading-relaxed">
                            <strong className="text-indigo-300">How to use OpenRouter:</strong><br/>
                            1. Get a free API key from <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">openrouter.ai/keys</a><br/>
                            2. Paste the key below.<br/>
                            3. Use a model name like <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono text-[10px]">anthropic/claude-3.5-sonnet</code> or <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono text-[10px]">openai/gpt-4o</code>.
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-1.5">API Key</label>
                            <input 
                              type="password" 
                              value={customApiKey}
                              onChange={(e) => setCustomApiKey(e.target.value)}
                              placeholder="sk-or-v1-..."
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Base URL</label>
                            <input 
                              type="text" 
                              value={customBaseUrl}
                              onChange={(e) => setCustomBaseUrl(e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Model Name</label>
                            <input 
                              type="text" 
                              value={customModel}
                              onChange={(e) => setCustomModel(e.target.value)}
                              placeholder="anthropic/claude-3.5-sonnet"
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50"
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Custom Instructions (Optional)</label>
                        <textarea 
                          value={customInstructions}
                          onChange={(e) => setCustomInstructions(e.target.value)}
                          placeholder="E.g., Focus heavily on the Big Eye Boy road, or prefer Banker if in doubt..."
                          className="w-full h-20 bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50 resize-none"
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
                        <div>
                          <div className="text-sm font-medium text-zinc-300">Turbo Mode</div>
                          <div className="text-xs text-zinc-500">Ultra-fast analysis for 15s betting windows</div>
                        </div>
                        <button
                          onClick={() => setTurboMode(!turboMode)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${turboMode ? 'bg-indigo-500' : 'bg-zinc-700'}`}
                        >
                          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${turboMode ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              
              <button
                onClick={handlePredict}
                disabled={isPredicting || history.length < 3 || prediction !== null}
                className="w-full flex items-center justify-center gap-2 py-4 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-indigo-500/20 disabled:shadow-none relative overflow-hidden group"
              >
                {isPredicting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Analyzing Patterns...
                  </>
                ) : prediction ? (
                  <>
                    <Play className="w-5 h-5 opacity-50" />
                    Waiting for Result...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    Predict Next Outcome
                  </>
                )}
              </button>

              {error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div className="mt-6 flex-1 flex flex-col">
                <AnimatePresence mode="wait">
                  {prediction ? (
                    <motion.div
                      key="prediction"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex-1 flex flex-col"
                    >
                      <div className="text-center mb-6">
                        <p className="text-sm text-zinc-400 mb-2">Predicted Outcome</p>
                        <div className={`inline-flex items-center justify-center px-6 py-3 rounded-2xl border-2 mb-4
                          ${prediction.prediction === 'Banker' ? 'bg-red-500/10 border-red-500/50 text-red-400' : 
                            prediction.prediction === 'Player' ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' : 
                            'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'}`}
                        >
                          <span className="text-3xl font-bold tracking-tight">{prediction.prediction}</span>
                        </div>
                        
                        {/* Prominent Current Bet Display */}
                        <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-4 flex flex-col items-center justify-center shadow-inner">
                          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Suggested Bet ({strategy})</span>
                          <span className="text-3xl font-black text-indigo-400">
                            ₱{currentBet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          {currentBet === bankroll && bankroll > 0 && (
                            <span className="text-[10px] text-red-400 font-bold uppercase tracking-widest mt-1 animate-pulse">All In!</span>
                          )}
                          {currentBet === 0 && (
                            <span className="text-[10px] text-red-400 font-bold uppercase tracking-widest mt-1">Bankrupt - Reset Bankroll</span>
                          )}
                        </div>
                      </div>

                      <div className="mb-6">
                        <div className="flex items-center justify-between text-sm mb-2">
                          <span className="text-zinc-400">Confidence Level</span>
                          <span className="font-mono text-indigo-400">{prediction.confidence}%</span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${prediction.confidence}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="h-full bg-indigo-500 rounded-full"
                          />
                        </div>
                      </div>

                      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex-1">
                        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Reasoning</h3>
                        <p className="text-sm text-zinc-300 leading-relaxed">
                          {prediction.reasoning}
                        </p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-center p-6 border-2 border-dashed border-zinc-800 rounded-xl"
                    >
                      <Sparkles className="w-8 h-8 mb-3 opacity-50" />
                      <p className="text-sm">Enter at least 3 hands and click predict to see AI analysis.</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
