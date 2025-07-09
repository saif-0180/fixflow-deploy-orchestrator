import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import LogDisplay from './LogDisplay';
import VMSelector from './VMSelector';

const SystemctlOperations: React.FC = () => {
  const [selectedService, setSelectedService] = useState('');
  const [selectedOperation, setSelectedOperation] = useState('');
  const [selectedVMs, setSelectedVMs] = useState<string[]>([]);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [operationStatus, setOperationStatus] = useState<'idle' | 'loading' | 'running' | 'success' | 'failed' | 'completed'>('idle');
  const { toast } = useToast();

  // Fetch available services
  const { data: availableServices = [], isLoading: isLoadingServices } = useQuery({
    queryKey: ['available-services'],
    queryFn: async () => {
      const response = await fetch('/api/systemd/services');
      if (!response.ok) {
        throw new Error('Failed to fetch services');
      }
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Execute systemctl operation
  const executeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/systemctl/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          service: selectedService,
          operation: selectedOperation,
          vms: selectedVMs,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to execute systemctl operation');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setOperationId(data.operationId);
      setOperationStatus('running');
      toast({
        title: "Operation Started",
        description: `Systemctl operation initiated with ID: ${data.operationId}`,
      });
    },
    onError: (error) => {
      setOperationStatus('failed');
      toast({
        title: "Operation Failed",
        description: `Failed to start operation: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    },
  });

  // Fetch operation logs
  const { data: operationLogs } = useQuery({
    queryKey: ['systemctl-operation-logs', operationId],
    queryFn: async () => {
      if (!operationId) return { logs: [], status: 'idle' };

      const response = await fetch(`/api/systemctl/logs/${operationId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch operation logs');
      }
      return response.json();
    },
    enabled: !!operationId,
    refetchInterval: 2000, // Poll every 2 seconds
  });

  // Update logs and status from API
  useEffect(() => {
    if (operationLogs) {
      setLogs(operationLogs.logs || []);
      const status = operationLogs.status || 'idle';
      // Map 'timeout' to 'failed' to match the allowed status types
      setOperationStatus(status === 'timeout' ? 'failed' : status);
    }
  }, [operationLogs]);

  const handleExecute = () => {
    if (!selectedService || !selectedOperation || selectedVMs.length === 0) {
      toast({
        title: "Error",
        description: "Please select a service, operation, and at least one VM",
        variant: "destructive",
      });
      return;
    }
    executeMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#F79B72] mb-4">Systemctl Operations</h2>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column - Selection and Controls */}
        <div className="xl:col-span-1 space-y-6">
          <Card className="bg-[#1a2b42] text-[#EEEEEE] border-2 border-[#EEEEEE]/30">
            <CardHeader>
              <CardTitle className="text-[#F79B72]">Operation Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="service-select" className="text-[#F79B72]">Select Service</Label>
                <Select value={selectedService} onValueChange={setSelectedService}>
                  <SelectTrigger id="service-select" className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    <SelectValue placeholder={isLoadingServices ? "Loading..." : "Select a Service"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableServices.map((service: string) => (
                      <SelectItem key={service} value={service}>{service}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="operation-select" className="text-[#F79B72]">Select Operation</Label>
                <Select value={selectedOperation} onValueChange={setSelectedOperation}>
                  <SelectTrigger id="operation-select" className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    <SelectValue placeholder="Select an Operation" />
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
                <Label className="text-[#F79B72]">Select VMs</Label>
                <VMSelector onSelectionChange={setSelectedVMs} selectedVMs={selectedVMs} />
              </div>

              <Button
                onClick={handleExecute}
                disabled={!selectedService || !selectedOperation || selectedVMs.length === 0 || executeMutation.isPending || operationStatus === 'running'}
                className="w-full bg-[#F79B72] text-[#2A4759] hover:bg-[#F79B72]/80"
              >
                {executeMutation.isPending || operationStatus === 'running' ? "Executing..." : "Execute"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Middle Column - Placeholder for Visualization (if any) */}
        <div className="xl:col-span-1">
          <Card className="bg-[#1a2b42] text-[#EEEEEE] border-2 border-[#EEEEEE]/30 h-full">
            <CardHeader>
              <CardTitle className="text-[#F79B72]">Operation Status</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-full text-[#EEEEEE]/50">
              {operationStatus === 'idle' ? (
                <div>Select a service, operation, and VMs to begin.</div>
              ) : operationStatus === 'loading' ? (
                <div>Loading...</div>
              ) : operationStatus === 'running' ? (
                <div>Operation in progress...</div>
              ) : operationStatus === 'success' ? (
                <div className="text-green-400">Operation completed successfully.</div>
              ) : operationStatus === 'failed' ? (
                <div className="text-red-400">Operation failed. Check logs for details.</div>
              ) : (
                <div>Operation status: {operationStatus}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Logs */}
        <div className="xl:col-span-1">
          <LogDisplay
            logs={logs}
            height="500px"
            title="Systemctl Operation Logs"
            status={operationStatus}
          />
        </div>
      </div>
    </div>
  );
};

export default SystemctlOperations;
