import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Save, TestTube, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface Settings {
  githubToken: string;
  repoOwner: string;
  repoName: string;
  confluenceUrl: string;
  confluenceEmail: string;
  confluenceToken: string;
  pageId: string;
}

type Status = 'idle' | 'testing' | 'saving' | 'success' | 'error';

const OptionsPage: React.FC = () => {
  const [settings, setSettings] = useState<Settings>({
    githubToken: '',
    repoOwner: '',
    repoName: '',
    confluenceUrl: '',
    confluenceEmail: '',
    confluenceToken: '',
    pageId: ''
  });

  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Load saved settings
    chrome.storage.sync.get([
      'githubToken',
      'repoOwner', 
      'repoName',
      'confluenceUrl',
      'confluenceEmail',
      'confluenceToken',
      'pageId',
    ], (result) => {
      setSettings(prev => ({ 
        ...prev, 
        ...result
      }));
    });
  }, []);

  const handleInputChange = (field: keyof Settings) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setSettings(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('saving');
    setMessage('Saving settings...');

    try {
      await new Promise<void>((resolve) => {
        chrome.storage.sync.set(settings, () => {
          resolve();
        });
      });

      setStatus('success');
      setMessage('Settings saved successfully!');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (error) {
      setStatus('error');
      setMessage('Failed to save settings');
    }
  };

  const handleTest = async () => {
    setStatus('testing');
    setMessage('Testing connections...');

    try {
      // Send message to background script to test connections with timeout
      const response = await new Promise<any>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Connection test timed out after 30 seconds'));
        }, 30000); // 30 second timeout

        chrome.runtime.sendMessage(
          { 
            action: 'testConnections',
            settings 
          },
          (response) => {
            clearTimeout(timeoutId);
            
            // Check for chrome.runtime.lastError first
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }

            // Check if response exists
            if (!response) {
              reject(new Error('No response received from background script'));
              return;
            }

            resolve(response);
          }
        );
      });

      console.log('Test response:', response);

      if (response?.success) {
        setStatus('success');
        setMessage('All connections successful!');
        setTimeout(() => setStatus('idle'), 3000);
      } else {
        setStatus('error');
        setMessage(response?.error || response?.message || 'Connection test failed');
      }
    } catch (error) {
      setStatus('error');
      const errorMessage = error instanceof Error ? error.message : 'Failed to test connections';
      setMessage(errorMessage);
      console.error('Test connection error:', error);
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'testing':
      case 'saving':
        return <TestTube className="h-4 w-4 animate-pulse" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const isValid = [
    settings.githubToken,
    settings.repoOwner,
    settings.repoName,
    settings.confluenceUrl,
    settings.confluenceEmail,
    settings.confluenceToken,
    settings.pageId
  ].every((value: string) => value.trim() !== '');

  return (
    <div className="max-w-2xl mx-auto p-6 bg-background min-h-screen">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            GitHub to Confluence Integration
          </h1>
          <p className="text-muted-foreground">
            Configure your GitHub repository and Confluence page settings
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-8">
          {/* GitHub Section */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground border-b pb-2">
              GitHub Configuration
            </h2>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                GitHub Personal Access Token *
              </label>
              <Input
                type="password"
                value={settings.githubToken}
                onChange={handleInputChange('githubToken')}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                required
              />
              <p className="text-xs text-muted-foreground">
                Required permissions: repo (or public_repo for public repositories)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Repository Owner *
                </label>
                <Input
                  value={settings.repoOwner}
                  onChange={handleInputChange('repoOwner')}
                  placeholder="username or organization"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Repository Name *
                </label>
                <Input
                  value={settings.repoName}
                  onChange={handleInputChange('repoName')}
                  placeholder="repository-name"
                  required
                />
              </div>
            </div>
          </div>

          {/* Confluence Section */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground border-b pb-2">
              Confluence Configuration
            </h2>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Confluence Base URL *
              </label>
              <Input
                type="url"
                value={settings.confluenceUrl}
                onChange={handleInputChange('confluenceUrl')}
                placeholder="https://yourcompany.atlassian.net"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Confluence Email *
              </label>
              <Input
                type="email"
                value={settings.confluenceEmail}
                onChange={handleInputChange('confluenceEmail')}
                placeholder="your-email@company.com"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Confluence API Token *
              </label>
              <Input
                type="password"
                value={settings.confluenceToken}
                onChange={handleInputChange('confluenceToken')}
                placeholder="Your Confluence API token"
                required
              />
              <p className="text-xs text-muted-foreground">
                Create at:{' '}
                <a 
                  href="https://id.atlassian.com/manage-profile/security/api-tokens" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Atlassian API Tokens
                </a>
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Confluence Page ID *
              </label>
              <Input
                value={settings.pageId}
                onChange={handleInputChange('pageId')}
                placeholder="123456789"
                required
              />
              <p className="text-xs text-muted-foreground">
                Find this in your Confluence page URL
              </p>
            </div>
          </div>

          {/* Status Message */}
          {message && (
            <div className={cn(
              "flex items-center gap-2 p-3 rounded border text-sm",
              status === 'success' && "bg-green-50 text-green-700 border-green-200",
              status === 'error' && "bg-red-50 text-red-700 border-red-200",
              (status === 'testing' || status === 'saving') && "bg-blue-50 text-blue-700 border-blue-200"
            )}>
              {getStatusIcon()}
              {message}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={!isValid || status === 'testing' || status === 'saving'}
            >
              <TestTube className="h-4 w-4 mr-2" />
              {status === 'testing' ? 'Testing...' : 'Test Connection'}
            </Button>
            
            <Button
              type="submit"
              disabled={!isValid || status === 'testing' || status === 'saving'}
            >
              <Save className="h-4 w-4 mr-2" />
              {status === 'saving' ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Mount the React app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<OptionsPage />);
}
