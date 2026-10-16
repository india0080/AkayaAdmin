"use client";

import { useState } from "react";
import { callAdmin } from "@/lib/api";
import { useCan } from "@/lib/session";
import {
  Button, EmptyState, Field, Notice, PageHeader, Panel, Select, Skeleton,
  Textarea, TextInput, useToast,
} from "@/ui";

interface RunResult {
  output: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

export default function PlaygroundPage() {
  const can = useCan();
  const canTest = can("ai.behaviour.configure");
  const toast = useToast();

  const [modelId, setModelId] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userMessage, setUserMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  async function run() {
    if (!userMessage.trim()) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await callAdmin<RunResult>("adminPlayground", {
        action: "test",
        modelId: modelId || undefined,
        systemPrompt: systemPrompt || undefined,
        userMessage,
      });
      setResult(res);
    } catch (e) {
      toast.error("Test failed", (e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <PageHeader
        title="AI Playground"
        description="Test prompts against models before deploying. Results stay in this session and are not logged."
      />
      {!canTest ? (
        <EmptyState title="Permission required">You need the ai.behaviour.configure permission to use the playground.</EmptyState>
      ) : (
        <div className="space-y-4">
          <Panel title="Prompt">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Model (optional)" hint="Leave blank for the default routing">
                {(p) => (
                  <TextInput {...p} value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="e.g. gpt-4o, claude-sonnet" />
                )}
              </Field>
              <div />
              <Field label="System prompt (optional)" className="sm:col-span-2">
                {(p) => (
                  <Textarea {...p} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={3} placeholder="You are a helpful assistant..." />
                )}
              </Field>
              <Field label="User message" className="sm:col-span-2">
                {(p) => (
                  <Textarea {...p} value={userMessage} onChange={(e) => setUserMessage(e.target.value)} rows={4} placeholder="Type a message to test..." />
                )}
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="primary" loading={running} disabled={!userMessage.trim()} onClick={() => void run()}>
                Run test
              </Button>
            </div>
          </Panel>

          {result && (
            <Panel title="Response">
              <div className="mb-3 flex flex-wrap gap-4 text-xs text-fg-muted">
                <span>Latency: {result.latencyMs}ms</span>
                <span>Input: {result.inputTokens} tokens</span>
                <span>Output: {result.outputTokens} tokens</span>
              </div>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-raised p-3 text-sm text-fg">
                {result.output}
              </pre>
            </Panel>
          )}

          <Notice tone="info">
            Playground calls go through the same AI gateway as user requests. Token usage is billed to the admin account.
          </Notice>
        </div>
      )}
    </>
  );
}
