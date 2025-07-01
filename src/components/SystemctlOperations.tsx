
import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import LogDisplay from './LogDisplay';
import VMSelector from './VMSelector';
import { Settings, Play, Square, RotateCcw, Info, Loader2 } from 'lucide-react';
import { toast } from './ui/use-toast';

interface SystemctlOperationVariables {
  vmName: string;
  serviceName: string;
  operation: string;
}

const performSystemctlOperation = async (variables: SystemctlOperationVariables): Promise<any> => {
  const response = await fetch('/api/systemctl', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(variables),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || `Failed to perform operation: ${response.status}`);
  }

  return response.json();
};

const SystemctlOperations = () => {
  const [vmName, setVmName] = useState<string>('');
  const [serviceName, setServiceName] = useState<string>('');
  const [operation, setOperation] = useState<string>('start');
  const [logs, setLogs] = useState<string[]>([]);

  const queryClient = useQueryClient();

  const { mutate, isPending, isError, error, data, reset } = useMutation({
    mutationFn: performSystemctlOperation,
    onSuccess: (data) => {
      setLogs(data.logs || []);
      toast({
        title: "Systemctl Operation Successful",
        description: `Successfully performed ${operation} on ${serviceName} on ${vmName}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
    },
    onError: (err: any) => {
      setLogs(err.logs || []);
      toast({
        variant: "destructive",
        title: "Operation Failed",
        description: err.message || "Failed to perform systemctl operation.",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLogs([]);
    mutate({ vmName, serviceName, operation });
  };

  const handleReset = () => {
    setVmName('');
    setServiceName('');
    setOperation('start');
    setLogs([]);
    reset();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Systemctl Operations</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <VMSelector onChange={setVmName} value={vmName} />

          <div className="grid gap-2">
            <Label htmlFor="service">Service Name</Label>
            <Input
              id="service"
              placeholder="Enter service name"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="operation">Operation</Label>
            <Select onValueChange={setOperation} defaultValue={operation}>
              <SelectTrigger id="operation">
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

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="secondary" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <Button type="submit" onClick={handleSubmit} disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run Operation
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Info className="h-5 w-5" />
              <span>Operation Logs</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LogDisplay logs={logs} height="400px" status="completed" />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SystemctlOperations;
