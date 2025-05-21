
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export interface VMSelectorProps {
  onSelectionChange: (vms: string[]) => void;
  selectedVMs?: string[];
  selectedTypes?: string[];
}

const VMSelector: React.FC<VMSelectorProps> = ({ 
  onSelectionChange, 
  selectedVMs = [], 
  selectedTypes = [] 
}) => {
  const [selectedVMList, setSelectedVMList] = useState<string[]>(selectedVMs);

  // Fetch VMs from API instead of local inventory file
  const { data: vmsData = [], isLoading } = useQuery({
    queryKey: ['vms'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/vms');
        if (!response.ok) {
          console.error('Error fetching VMs:', await response.text());
          throw new Error('Failed to fetch VMs');
        }
        const data = await response.json();
        console.log('Loaded VMs from API:', data);
        return data || [];
      } catch (error) {
        console.error('Error fetching VMs:', error);
        return []; // Return empty array on error
      }
    },
    refetchOnWindowFocus: false,
  });

  // Only update selectedVMs when the prop changes, not on every render
  useEffect(() => {
    if (JSON.stringify(selectedVMs) !== JSON.stringify(selectedVMList)) {
      setSelectedVMList(selectedVMs);
    }
  }, [selectedVMs]);

  // Handle checkbox changes
  const handleVMChange = (vmName: string, checked: boolean) => {
    const updatedSelection = checked
      ? [...selectedVMList, vmName]
      : selectedVMList.filter(vm => vm !== vmName);
    
    setSelectedVMList(updatedSelection);
    onSelectionChange(updatedSelection);
  };

  if (isLoading) {
    return <div>Loading VM list...</div>;
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2">
        {vmsData.length === 0 ? (
          <p className="text-sm text-gray-400">No VMs available in inventory.</p>
        ) : (
          vmsData.map((vm: any) => (
            <div key={vm.name} className="flex items-center space-x-2">
              <Checkbox 
                id={`vm-${vm.name}`}
                checked={selectedVMList.includes(vm.name)}
                onCheckedChange={(checked) => handleVMChange(vm.name, checked === true)}
              />
              <Label htmlFor={`vm-${vm.name}`}>{vm.name}</Label>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default VMSelector;
