
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface VMSelectorProps {
  selectedVMs: string[];
  setSelectedVMs: (vms: string[]) => void;
}

const VMSelector: React.FC<VMSelectorProps> = ({ selectedVMs, setSelectedVMs }) => {
  // Fetch VMs
  const { data: vms = [], isLoading } = useQuery({
    queryKey: ['vms'],
    queryFn: async () => {
      const response = await fetch('/api/vms');
      if (!response.ok) {
        throw new Error('Failed to fetch VMs');
      }
      return response.json();
    }
  });

  const vmGroups = {
    batch: vms.filter((vm: any) => vm.type === 'batch'),
    imdg: vms.filter((vm: any) => vm.type === 'imdg'),
    kafka: vms.filter((vm: any) => vm.type === 'kafka'),
    airflow: vms.filter((vm: any) => vm.type === 'airflow'),
    monitoring: vms.filter((vm: any) => vm.type === 'monitoring'),
  };

  const handleVMChange = (vmName: string) => {
    setSelectedVMs(prev => 
      prev.includes(vmName) 
        ? prev.filter(vm => vm !== vmName) 
        : [...prev, vmName]
    );
  };

  const selectAllByType = (type: string, vms: any[]) => {
    const vmNames = vms.map((vm: any) => vm.name);
    
    const allSelected = vms.every((vm: any) => selectedVMs.includes(vm.name));
    
    if (allSelected) {
      // Deselect all VMs of this type
      setSelectedVMs(prev => prev.filter(vm => !vmNames.includes(vm)));
    } else {
      // Select all VMs of this type
      const currentSelected = selectedVMs.filter(vm => !vmNames.includes(vm));
      setSelectedVMs([...currentSelected, ...vmNames]);
    }
  };

  if (isLoading) {
    return <div>Loading VMs...</div>;
  }

  return (
    <div className="space-y-4">
      <Label>Select VMs</Label>
      
      {Object.entries(vmGroups).map(([groupType, groupVMs]: [string, any[]]) => (
        groupVMs.length > 0 && (
          <div key={groupType} className="space-y-2">
            <div className="flex items-center space-x-2 ml-2">
              <Checkbox 
                id={`select-all-${groupType}`} 
                checked={groupVMs.every((vm: any) => selectedVMs.includes(vm.name))}
                onCheckedChange={() => selectAllByType(groupType, groupVMs)}
              />
              <Label htmlFor={`select-all-${groupType}`} className="font-medium capitalize">{groupType} ({groupVMs.length})</Label>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 ml-6">
              {groupVMs.map((vm: any) => (
                <div key={vm.name} className="flex items-center space-x-2">
                  <Checkbox 
                    id={vm.name} 
                    checked={selectedVMs.includes(vm.name)}
                    onCheckedChange={() => handleVMChange(vm.name)}
                  />
                  <Label htmlFor={vm.name}>{vm.name}</Label>
                </div>
              ))}
            </div>
          </div>
        )
      ))}
    </div>
  );
};

export default VMSelector;
