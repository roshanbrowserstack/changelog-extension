import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../components/ui/button';
import { RefreshCw, Settings, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface ExtensionState {
  lastCheck: string | null;
  status: 'ready' | 'checking' | 'success' | 'error';
  message?: string;
}

const Popup: React.FC = () => {
  const [state, setState] = useState<ExtensionState>({
    lastCheck: null,
    status: 'ready'
  });

  useEffect(() => {
    // Load initial state from storage
    chrome.storage.sync.get(['lastCheck'], (result) => {
      if (result.lastCheck) {
        setState(prev => ({ ...prev, lastCheck: result.lastCheck }));
      }
    });
  }, []);

  const handleCheckPRs = async () => {
    setState(prev => ({ ...prev, status: 'checking', message: 'Checking for merged PRs...' }));
    
    try {
      // Send message to background script to check for PRs
      chrome.runtime.sendMessage({ action: 'CHECK_PRS' }, (response) => {
        if (response?.success) {
          setState(prev => ({
            ...prev,
            status: 'success',
            message: `Found ${response.data.count || 0} new PRs`,
            lastCheck: new Date().toLocaleString()
          }));
          
          // Update storage with last check time
          chrome.storage.sync.set({ lastCheck: new Date().toLocaleString() });
        } else {
          setState(prev => ({
            ...prev,
            status: 'error',
            message: response?.error || 'Failed to check PRs'
          }));
        }
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        status: 'error',
        message: 'Error checking PRs'
      }));
    }
  };

  const handleOpenOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  const getStatusIcon = () => {
    switch (state.status) {
      case 'checking':
        return <RefreshCw className="h-4 w-4 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <RefreshCw className="h-4 w-4" />;
    }
  };

  return (
    <div className="w-80 p-4 bg-background">
      <div className="space-y-4">
        {/* Header */}
        <div className="text-center border-b pb-3">
          <h1 className="text-lg font-semibold text-foreground">GitHub → Confluence</h1>
          <p className="text-sm text-muted-foreground">Monitor PRs and log to Confluence</p>
        </div>

        {/* Main Action */}
        <div className="space-y-3">
          <Button 
            onClick={handleCheckPRs}
            disabled={state.status === 'checking'}
            className="w-full"
          >
            {getStatusIcon()}
            <span className="ml-2">
              {state.status === 'checking' ? 'Checking...' : 'Check for Merged PRs'}
            </span>
          </Button>

          {/* Status Message */}
          {state.message && (
            <div className={cn(
              "p-2 rounded text-sm text-center",
              state.status === 'success' && "bg-green-50 text-green-700 border border-green-200",
              state.status === 'error' && "bg-red-50 text-red-700 border border-red-200",
              state.status === 'checking' && "bg-blue-50 text-blue-700 border border-blue-200"
            )}>
              {state.message}
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center py-1">
            <span className="text-muted-foreground">Last Check:</span>
            <span className="text-foreground">
              {state.lastCheck || 'Never'}
            </span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-muted-foreground">Status:</span>
            <span className={cn(
              "capitalize",
              state.status === 'ready' && "text-blue-600",
              state.status === 'success' && "text-green-600",
              state.status === 'error' && "text-red-600",
              state.status === 'checking' && "text-orange-600"
            )}>
              {state.status}
            </span>
          </div>
        </div>

        {/* Settings Button */}
        <div className="pt-2 border-t">
          <Button 
            variant="outline" 
            onClick={handleOpenOptions}
            className="w-full"
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>
    </div>
  );
};

// Mount the React app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}
