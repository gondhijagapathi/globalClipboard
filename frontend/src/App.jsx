import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Upload, File, Type, Clock, Trash2, Copy, Download, RefreshCw } from "lucide-react"

function App() {
  const [items, setItems] = useState([])
  // Try API_KEY first (exposed via vite.config.js), then fallback to VITE_API_KEY
  const [apiKey] = useState(import.meta.env.API_KEY || import.meta.env.VITE_API_KEY || '')
  const [username, setUsername] = useState(localStorage.getItem('username') || '')
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [expiry, setExpiry] = useState(60)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (username) {
      localStorage.setItem('username', username)
    }
  }, [username])

  useEffect(() => {
    if (apiKey) {
      fetchItems()
      // Auto-refresh items
      const interval = setInterval(() => {
        fetchItems(true); // Fetch new items from server
      }, 5000); // Check every 5 seconds

      return () => clearInterval(interval);
    }
  }, [apiKey])

  const fetchItems = async (isBackground = false) => {
    if (!apiKey) return
    if (!isBackground) setLoading(true)
    try {
      const res = await fetch('/api/list', {
        headers: { 'x-api-key': apiKey }
      })
      if (res.ok) {
        const data = await res.json()
        setItems(data)
      } else {
        console.error("Failed to fetch")
      }
    } catch (error) {
      console.error("Error fetching items", error)
    } finally {
      if (!isBackground) setLoading(false)
    }
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    if ((!text && !file) || !apiKey) return

    setUploading(true)
    const formData = new FormData()
    if (file) formData.append('file', file)
    if (text) formData.append('text', text)
    formData.append('expiry', expiry)
    if (username) formData.append('username', username)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey
        },
        body: formData
      })
      if (res.ok) {
        setText('')
        setFile(null)
        setExpiry(60)
        fetchItems()
      } else {
        alert("Upload failed. Check API Key.")
      }
    } catch (error) {
      console.error("Upload error", error)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm("Delete this item?")) return;
    try {
      const res = await fetch(`/api/delete/${id}`, {
        method: 'DELETE',
        headers: { 'x-api-key': apiKey }
      });
      if (res.ok) {
        fetchItems();
      } else {
        alert("Failed to delete");
      }
    } catch (error) {
      console.error("Delete error", error);
    }
  }

  const handleCopy = (content) => {
    navigator.clipboard.writeText(content)
  }

  const formatTime = (ms) => {
    return new Date(ms).toLocaleString()
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex justify-between items-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Global Clipboard</h1>
          <Input
            placeholder="Your Name (Optional)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-48"
          />
        </div>

        {/* Upload Section ... (no changes needed inside form other than it using 'username' state which is already handled in handleUpload) */}
        <Card>
          <CardHeader>
            <CardTitle>Send Item</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="flex flex-col space-y-2">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={file ? "outline" : "default"}
                    onClick={() => { setFile(null); }}
                    className="flex-1"
                  >
                    <Type className="mr-2 h-4 w-4" /> Text
                  </Button>
                  <Button
                    type="button"
                    variant={file ? "default" : "outline"}
                    onClick={() => { document.getElementById('file-upload').click() }}
                    className="flex-1"
                  >
                    <File className="mr-2 h-4 w-4" /> {file ? file.name : "File"}
                  </Button>
                  <input
                    id="file-upload"
                    type="file"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files[0])}
                  />
                </div>

                {!file && (
                  <Input
                    placeholder="Paste text here..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                )}
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 flex-1">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    className="w-24"
                    min="1"
                  />
                  <span className="text-sm text-muted-foreground">minutes</span>
                </div>
                <Button type="submit" disabled={uploading}>
                  {uploading ? "Sending..." : <Upload className="mr-2 h-4 w-4" />}
                  {uploading ? "" : "Send"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Items List */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Active Items</h2>
            <Button variant="ghost" size="sm" onClick={fetchItems} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <Card key={item.id} className="relative overflow-hidden group">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-base font-medium flex items-center gap-2 truncate">
                      {item.type === 'file' ? <File className="h-4 w-4 text-blue-500" /> : <Type className="h-4 w-4 text-green-500" />}
                      <span className="truncate">{item.filename || "Text Content"}</span>
                    </CardTitle>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pb-2 text-sm text-muted-foreground">
                  <p>From: <span className="font-medium text-foreground">{item.username || 'web client'}</span></p>
                  <p>Expires: {formatTime(item.expiry)}</p>
                  <p className="text-xs opacity-70">Created: {formatTime(item.created_at)}</p>
                </CardContent>
                <CardFooter className="bg-muted/50 p-2 flex justify-between">
                  <Button variant="ghost" size="sm" asChild>
                    <a href={`/api/download/${item.id}`} target="_blank" rel="noreferrer" download={item.type === 'file'}>
                      <Download className="h-4 w-4 mr-1" /> Open/DL
                    </a>
                  </Button>
                  {item.type !== 'file' && (
                    <Button variant="ghost" size="sm" onClick={() => fetch(`/api/download/${item.id}`).then(r => r.json()).then(d => handleCopy(d.text))}>
                      <Copy className="h-4 w-4 mr-1" /> Copy
                    </Button>
                  )}
                </CardFooter>
              </Card>
            ))}
            {items.length === 0 && !loading && (
              <p className="text-center text-muted-foreground col-span-full py-8">No active items.</p>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

export default App
