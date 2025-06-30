import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Play, Square, RotateCcw, RefreshCw, Activity, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import LogDisplay from "./LogDisplay";

interface SystemctlResponse {
  success: boolean;
  output?: string;
  error?: string;
}

type StatusType = "loading" | "idle" | "running" | "success" | "failed" | "completed";

const SystemctlOperations = () => {
  const [serviceName, setServiceName] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<StatusType>("idle");

  const handleServiceNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setServiceName(e.target.value);
  };

  const handleStartService = () => {
    handleOperationWithTimeout('start', serviceName);
  };

  const handleStopService = () => {
    handleOperationWithTimeout('stop', serviceName);
  };

  const handleRestartService = () => {
    handleOperationWithTimeout('restart', serviceName);
  };

  const handleStatusService = () => {
    handleOperationWithTimeout('status', serviceName);
  };

  const handleOperationWithTimeout = async (operation: string, service: string, timeout = 30000) => {
    console.log(`[SystemctlOperations] Starting ${operation} for service: ${service}`);
    
    if (!service.trim()) {
      toast.error("Please enter a service name");
      return;
    }

    setIsLoading(true);
    setLogs([]);
    
    // Map timeout status to valid status type
    const mapStatus = (status: string): "loading" | "idle" | "running" | "success" | "failed" | "completed" => {
      if (status === "timeout") return "failed";
      return status as "loading" | "idle" | "running" | "success" | "failed" | "completed";
    };
    
    setStatus(mapStatus("running"));

    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Operation timed out')), timeout)
      );

      const operationPromise = fetch('/api/systemctl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: operation, 
          service: service.trim(),
          timeout: timeout / 1000
        })
      });

      const response = await Promise.race([operationPromise, timeoutPromise]) as Response;
      const data = await response.json();

      if (data.success) {
        console.log(`[SystemctlOperations] ${operation} successful:`, data);
        setLogs(prev => [...prev, `✓ ${operation} completed successfully`]);
        if (data.output) {
          setLogs(prev => [...prev, ...data.output.split('\n').filter(Boolean)]);
        }
        setStatus(mapStatus("success"));
        toast.success(`${operation} completed successfully`);
      } else {
        console.error(`[SystemctlOperations] ${operation} failed:`, data.error);
        setLogs(prev => [...prev, `✗ ${operation} failed: ${data.error}`]);
        setStatus(mapStatus("failed"));
        toast.error(`${operation} failed: ${data.error}`);
      }
    } catch (error: any) {
      console.error(`[SystemctlOperations] ${operation} error:`, error);
      const errorMessage = error.message || 'Unknown error occurred';
      setLogs(prev => [...prev, `✗ Error: ${errorMessage}`]);
      
      if (errorMessage.includes('timed out')) {
        setStatus(mapStatus("failed")); // Map timeout to failed
        toast.error(`${operation} timed out after ${timeout/1000} seconds`);
      } else {
        setStatus(mapStatus("failed"));
        toast.error(`Error during ${operation}: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Service Management Section */}
      <Card className="bg-[#2A4759] border-[#F79B72]/20">
        <CardHeader>
          <CardTitle className="text-[#EEEEEE]">Service Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <Input
              type="text"
              placeholder="Enter service name"
              value={serviceName}
              onChange={handleServiceNameChange}
              className="bg-[#1a2b42] text-[#EEEEEE] placeholder:text-gray-500"
            />
            <div className="flex space-x-2">
              <Button variant="outline" className="bg-[#F79B72] text-[#2A4759] hover:bg-[#e6825a] disabled:bg-gray-400" onClick={handleStartService} disabled={isLoading}>
                {isLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Start
              </Button>
              <Button variant="outline" className="bg-[#F79B72] text-[#2A4759] hover:bg-[#e6825a] disabled:bg-gray-400" onClick={handleStopService} disabled={isLoading}>
                {isLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />}
                Stop
              </Button>
              <Button variant="outline" className="bg-[#F79B72] text-[#2A4759] hover:bg-[#e6825a] disabled:bg-gray-400" onClick={handleRestartService} disabled={isLoading}>
                {isLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                Restart
              </Button>
              <Button variant="outline" className="bg-[#F79B72] text-[#2A4759] hover:bg-[#e6825a] disabled:bg-gray-400" onClick={handleStatusService} disabled={isLoading}>
                {isLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Activity className="mr-2 h-4 w-4" />}
                Status
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Logs Section */}
      <Card className="bg-[#2A4759] border-[#F79B72]/20">
        <CardHeader>
          <CardTitle className="text-[#EEEEEE] flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Operation Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LogDisplay
            logs={logs}
            height="400px"
            title="Systemctl Operations"
            status={status}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default SystemctlOperations;
