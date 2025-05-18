
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
  fixedHeight = false,
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
      <div 
        className="bg-black rounded-md p-4 overflow-y-auto font-mono text-sm" 
        style={{ 
          height: fixedHeight ? height : height, 
          maxHeight: height,
          minHeight: fixedHeight ? height : "auto"
        }}
      >
        {logs.length === 0 ? (
          <p className="text-gray-500">No logs available. Start a deployment to see logs here.</p>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="mb-1">
              {log.includes('ERROR') || log.includes('FAILED') ? (
                <span className="text-red-500">{log}</span>
              ) : log.includes('SUCCESS') || log.includes('COMPLETED') ? (
                <span className="text-green-500">{log}</span>
              ) : (
                <span className="text-gray-300">{log}</span>
              )}
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};

export default LogDisplay;
