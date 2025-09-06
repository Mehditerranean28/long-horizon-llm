"use client";

import { useState, useEffect } from "react";

export default function SummarizePage() {
  const [input, setInput] = useState("");
  const [summary, setSummary] = useState("");
  const [loadingModel, setLoadingModel] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [summarizer, setSummarizer] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { pipeline } = await import('@xenova/transformers');
        const p = await pipeline("summarization", "Xenova/t5-small");
        if (!cancelled) {
          setSummarizer(() => p);
        }
      } catch (err) {
        console.error("Failed to load model", err);
      } finally {
        if (!cancelled) setLoadingModel(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenerate = async () => {
    if (!summarizer) return;
    setGenerating(true);
    try {
      const result = await summarizer(input, { min_length: 50, max_length: 250 });
      setSummary(result[0].summary_text);
    } catch (err) {
      console.error("Summarization failed", err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-xl space-y-4">
        <textarea
          className="w-full h-40 p-3 border rounded"
          placeholder="Enter text to summarize..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          className="w-full py-2 bg-blue-600 text-white rounded disabled:bg-gray-400 flex items-center justify-center"
          onClick={handleGenerate}
          disabled={loadingModel || generating}
        >
          {(loadingModel || generating) && (
            <span className="mr-2 animate-spin">🔄</span>
          )}
          {loadingModel ? "Loading Model" : generating ? "Summarizing" : "Generate Summary"}
        </button>
        {summary && (
          <div className="p-3 bg-gray-100 border rounded whitespace-pre-wrap">
            {summary}
          </div>
        )}
      </div>
    </div>
  );
}
