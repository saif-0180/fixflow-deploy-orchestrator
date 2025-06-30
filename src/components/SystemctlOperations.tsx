import React, { useState, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Settings } from 'lucide-react';
import { LogDisplay } from './LogDisplay';

interface VM {
  hostname: string;
  ip: string;
}

interface SystemctlResponse {
  success: boolean;
  message: string;
  logs: string[];
  status: string;
}

type LogDisplayStatus = "loading" | "idle" | "running" | "success" | "failed" | "completed";

const mapStatusToLogDisplayStatus = (status: string): "loading" | "idle" | "running" | "success" | "failed" | "completed" => {
  switch (status) {
    case 'timeout':
      return 'failed'; // Map timeout to failed
    case 'running':
      return 'running';
    case 'success':
      return 'success';
    case 'failed':
      return 'failed';
    case 'loading':
      return 'loading';
    case 'completed':
      return 'completed';
    default:
      return 'idle';
  }
};

export const SystemctlOperations = () => {
  const [vmHostname, setVmHostname] = useState<string>('');
  const [operation, setOperation] = useState<string>('');
  const [serviceName, setServiceName] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('idle');
  const { toast } = useToast();
  const [availableVMs, setAvailableVMs] = useState<VM[]>([]);

  useEffect(() => {
    const fetchVMs = async () => {
      try {
        const response = await fetch('/api/vms');
        if (response.ok) {
          const vms: VM[] = await response.json();
          setAvailableVMs(vms);
        } else {
          console.error("Failed to fetch VMs:", response.status);
          toast({
            title: "Error",
            description: "Failed to fetch VMs. Please check the server.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Error fetching VMs:", error);
        toast({
          title: "Error",
          description: "Failed to fetch VMs. Please check your network connection.",
          variant: "destructive",
        });
      }
    };

    fetchVMs();
  }, [toast]);

  const executeSystemctl = async () => {
    if (!vmHostname || !operation || !serviceName) {
      toast({
        title: "Error",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    setStatus('loading');
    setLogs([]);

    try {
      const response = await fetch('/api/systemctl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vmHostname, operation, serviceName }),
      });

      if (response.ok) {
        const result: SystemctlResponse = await response.json();
        setLogs(result.logs);
        setStatus(result.status);

        toast({
          title: "Success",
          description: result.message,
        });
      } else {
        const errorResult = await response.json();
        setLogs(errorResult.logs || [`Error: ${errorResult.message}`]);
        setStatus('failed');
        toast({
          title: "Error",
          description: errorResult.message || "Failed to execute systemctl operation.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error executing systemctl operation:", error);
      setLogs([`Error: ${error.message}`]);
      setStatus('failed');
      toast({
        title: "Error",
        description: error.message || "Failed to execute systemctl operation.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Settings className="h-5 w-5" />
          <span>Systemctl Operations</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="vm">Select VM</Label>
          <Select onValueChange={setVmHostname}>
            <SelectTrigger className="w-[100%]">
              <SelectValue placeholder="Select a VM" />
            </SelectTrigger>
            <SelectContent>
              {availableVMs.map((vm) => (
                <SelectItem key={vm.hostname} value={vm.hostname}>
                  {vm.hostname} ({vm.ip})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="operation">Operation</Label>
          <Select onValueChange={setOperation}>
            <SelectTrigger className="w-[100%]">
              <SelectValue placeholder="Select an operation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="start">Start</SelectItem>
              <SelectItem value="stop">Stop</SelectItem>
              <SelectItem value="restart">Restart</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="serviceName">Service Name</Label>
          <Input
            type="text"
            id="serviceName"
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
          />
        </div>
        <Button onClick={executeSystemctl} disabled={status === 'loading'}>
          {status === 'loading' ? 'Executing...' : 'Execute'}
        </Button>
        
        <LogDisplay
          logs={logs}
          height="400px"
          title="Systemctl Operation Logs"
          status={mapStatusToLogDisplayStatus(status)}
        />
      </CardContent>
    </Card>
  );
};
