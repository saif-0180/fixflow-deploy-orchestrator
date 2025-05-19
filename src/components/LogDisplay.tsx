
import React, { useRef, useEffect } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";

interface LogDisplayProps {
  logs: string[];
  height?: string;
  fixedHeight?: boolean;
  title?: string;
}

const LogDisplay: React.FC<LogDisplayProps> = ({ 
  logs, 
  height = "400px", 
  fixedHeight = true,
  title = "Logs" 
}) => {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  return (
    <div className="space-y-2 h-full">
      <h3 className="font-medium text-[#F79B72]">{title}</h3>
      <ScrollArea 
        className="bg-[#0A1929] rounded-md p-4 font-mono text-sm shadow-md border border-[#2A4759]" 
        style={{ 
          height: fixedHeight ? height : "auto", 
          maxHeight: height,
          minHeight: fixedHeight ? height : "auto"
        }}
      >
        {logs.length === 0 ? (
          <p className="text-gray-400">No logs available. Start a deployment to see logs here.</p>
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
