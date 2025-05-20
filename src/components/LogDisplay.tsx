
import React, { useRef, useEffect, useState } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface LogDisplayProps {
  logs: string[];
  height?: string;
  fixedHeight?: boolean;
  title?: string;
  fixAutoScroll?: boolean; // New prop to control auto-scrolling behavior
}

const LogDisplay: React.FC<LogDisplayProps> = ({ 
  logs, 
  height = "400px", 
  fixedHeight = true,
  title = "Logs",
  fixAutoScroll = false
}) => {
  const logEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [previousLogsLength, setPreviousLogsLength] = useState<number>(0);

  useEffect(() => {
    // Only auto-scroll if enabled and logs have changed
    if (autoScroll && logEndRef.current && logs.length !== previousLogsLength) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
      setPreviousLogsLength(logs.length);
    }
  }, [logs, autoScroll, previousLogsLength]);

  return (
    <div className="space-y-2 h-full">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-[#F79B72]">{title}</h3>
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
              {log.includes('ERROR') || log.includes('FAILED') || log.includes('failed') ? (
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
