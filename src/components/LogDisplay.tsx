
import React, { useRef, useEffect } from 'react';

interface LogDisplayProps {
  logs: string[];
  height?: string;
}

const LogDisplay: React.FC<LogDisplayProps> = ({ logs, height = "300px" }) => {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  return (
    <div className="space-y-2">
      <h3 className="font-medium">Logs</h3>
      <div 
        className="bg-black rounded-md p-4 overflow-y-auto font-mono text-sm" 
        style={{ height, maxHeight: height }}
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
