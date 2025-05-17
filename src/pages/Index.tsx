
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
      <div className="min-h-screen bg-[#2A4759] text-[#EEEEEE]">
        <header className="bg-[#F79B72] text-[#2A4759] px-6 py-4 shadow-md">
          <h1 className="text-2xl font-bold">Private-Fix-Deployment-Tool</h1>
        </header>
        
        <main className="container mx-auto px-4 py-6">
          <Tabs defaultValue="file" className="w-full">
            <TabsList className="grid w-full grid-cols-4 bg-[#DDDDDD] mb-6">
              <TabsTrigger value="file" className="data-[state=active]:bg-[#F79B72] data-[state=active]:text-[#2A4759] text-[#2A4759]">
                File Operations
              </TabsTrigger>
              <TabsTrigger value="sql" className="data-[state=active]:bg-[#F79B72] data-[state=active]:text-[#2A4759] text-[#2A4759]">
                SQL Operations
              </TabsTrigger>
              <TabsTrigger value="systemctl" className="data-[state=active]:bg-[#F79B72] data-[state=active]:text-[#2A4759] text-[#2A4759]">
                Systemctl Operations
              </TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-[#F79B72] data-[state=active]:text-[#2A4759] text-[#2A4759]">
                Deployment History
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="file" className="p-6 bg-[#DDDDDD] rounded-md">
              <FileOperations />
            </TabsContent>
            
            <TabsContent value="sql" className="p-6 bg-[#DDDDDD] rounded-md">
              <SqlOperations />
            </TabsContent>
            
            <TabsContent value="systemctl" className="p-6 bg-[#DDDDDD] rounded-md">
              <SystemctlOperations />
            </TabsContent>
            
            <TabsContent value="history" className="p-6 bg-[#DDDDDD] rounded-md">
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
