
import React, { useRef, useEffect, useState } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface LogDisplayProps {
  logs: string[];
  height?: string;
  fixedHeight?: boolean;
  title?: string;
  fixAutoScroll?: boolean;
  status?: 'idle' | 'loading' | 'running' | 'success' | 'failed' | 'completed';
}

const LogDisplay: React.FC<LogDisplayProps> = ({ 
  logs, 
  height = "400px", 
  fixedHeight = true,
  title = "Logs",
  fixAutoScroll = false,
  status = 'idle'
}) => {
  const logEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [previousLogsLength, setPreviousLogsLength] = useState<number>(0);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when logs change
  useEffect(() => {
    if (autoScroll && logEndRef.current && logs.length !== previousLogsLength) {
      setTimeout(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'auto' });
        setPreviousLogsLength(logs.length);
      }, 100);
    }
  }, [logs, autoScroll, previousLogsLength]);

  // Force scroll when status changes to success/completed
  useEffect(() => {
    if ((status === 'success' || status === 'completed') && logEndRef.current) {
      setTimeout(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 200);
    }
  }, [status]);

  // Get badge color based on status
  const getBadgeColorClass = () => {
    switch (status) {
      case 'success':
      case 'completed':
        return 'bg-green-500 hover:bg-green-600';
      case 'failed':
        return 'bg-red-500 hover:bg-red-600';
      case 'running':
        return 'bg-yellow-500 hover:bg-yellow-600';
      case 'loading':
        return 'bg-blue-500 hover:bg-blue-600';
      default:
        return 'bg-gray-500 hover:bg-gray-600';
    }
  };

  // Detect if log content contains errors
  const hasErrors = logs.some(log => 
    log.includes('ERROR') || 
    log.includes('FAILED') || 
    log.includes('failed') ||
    log.includes('error')
  );

  // Set appropriate status if there are errors but status isn't set yet
  const effectiveStatus = hasErrors && status === 'running' ? 'failed' : status;

  return (
    <div className="space-y-2 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-[#F79B72]">{title}</h3>
          {effectiveStatus !== 'idle' && (
            <Badge className={`${getBadgeColorClass()} text-white`}>
              {effectiveStatus === 'running' || effectiveStatus === 'loading' ? (
                <div className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  {effectiveStatus === 'loading' ? 'Loading' : 'Running'}
                </div>
              ) : (
                effectiveStatus.charAt(0).toUpperCase() + effectiveStatus.slice(1)
              )}
            </Badge>
          )}
        </div>
        {!fixAutoScroll && (
          <div className="flex items-center space-x-2">
            <Label htmlFor="auto-scroll" className="text-sm text-gray-400">Auto-scroll</Label>
            <Switch 
              id="auto-scroll" 
              checked={autoScroll} 
              onCheckedChange={setAutoScroll}
            />
          </div>
        )}
      </div>
      <ScrollArea 
        ref={scrollAreaRef}
        className="bg-[#0A1929] rounded-md p-4 font-mono text-sm shadow-md border border-[#2A4759]" 
        style={{ 
          height: fixedHeight ? height : "auto", 
          maxHeight: height,
          minHeight: fixedHeight ? height : "auto"
        }}
      >
        {logs.length === 0 ? (
          <p className="text-gray-400">No logs available. Start an operation to see logs here.</p>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="mb-1">
              {log.includes('ERROR') || log.includes('FAILED') || log.includes('failed') || log.includes('error') ? (
                <span className="text-red-400">{log}</span>
              ) : log.includes('SUCCESS') || log.includes('COMPLETED') || log.includes('successfully') ? (
                <span className="text-green-400">{log}</span>
              ) : log.includes('WARNING') ? (
                <span className="text-yellow-300">{log}</span>
              ) : log.includes('Checksum=') ? (
                <span className="text-blue-300">{log}</span>
              ) : (
                <span className="text-gray-200">{log}</span>
              )}
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </ScrollArea>
    </div>
  );
};

export default LogDisplay;
