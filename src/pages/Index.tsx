
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/toaster";
import FileOperations from "@/components/FileOperations";
import SqlOperations from "@/components/SqlOperations";
import SystemctlOperations from "@/components/SystemctlOperations";
import DeploymentHistory from "@/components/DeploymentHistory";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

const Index = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-[#1A1A1A] text-gray-100">
        <header className="bg-[#F97316] text-black px-6 py-4 shadow-md">
          <h1 className="text-2xl font-bold">Fix Deployment Orchestrator</h1>
        </header>
        
        <main className="container mx-auto px-4 py-6">
          <Tabs defaultValue="file" className="w-full">
            <TabsList className="grid w-full grid-cols-4 bg-[#2A2A2A] mb-6">
              <TabsTrigger value="file" className="data-[state=active]:bg-[#F97316] data-[state=active]:text-black">
                File Operations
              </TabsTrigger>
              <TabsTrigger value="sql" className="data-[state=active]:bg-[#F97316] data-[state=active]:text-black">
                SQL Operations
              </TabsTrigger>
              <TabsTrigger value="systemctl" className="data-[state=active]:bg-[#F97316] data-[state=active]:text-black">
                Systemctl Operations
              </TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-[#F97316] data-[state=active]:text-black">
                Deployment History
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="file" className="p-6 bg-[#2A2A2A] rounded-md">
              <FileOperations />
            </TabsContent>
            
            <TabsContent value="sql" className="p-6 bg-[#2A2A2A] rounded-md">
              <SqlOperations />
            </TabsContent>
            
            <TabsContent value="systemctl" className="p-6 bg-[#2A2A2A] rounded-md">
              <SystemctlOperations />
            </TabsContent>
            
            <TabsContent value="history" className="p-6 bg-[#2A2A2A] rounded-md">
              <DeploymentHistory />
            </TabsContent>
          </Tabs>
        </main>
        
        <Toaster />
      </div>
    </QueryClientProvider>
  );
};

export default Index;
