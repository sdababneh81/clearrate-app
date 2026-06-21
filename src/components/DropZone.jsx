import { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, Loader } from 'lucide-react';

export default function DropZone({ label, sublabel, onFile, status, fileName, accept = '.pdf,.txt' }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  const icons = {
    idle: <Upload className="w-8 h-8 text-blue-400" />,
    loading: <Loader className="w-8 h-8 text-blue-500 animate-spin" />,
    success: <CheckCircle className="w-8 h-8 text-green-500" />,
    error: <FileText className="w-8 h-8 text-red-400" />,
  };

  const borderColor = {
    idle: dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/40',
    loading: 'border-blue-400 bg-blue-50',
    success: 'border-green-400 bg-green-50',
    error: 'border-red-400 bg-red-50',
  };

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${borderColor[status || 'idle']}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current.click()}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={e => e.target.files[0] && onFile(e.target.files[0])} />
      <div className="flex flex-col items-center gap-2">
        {icons[status || 'idle']}
        <div>
          <p className="font-600 text-sm text-gray-800">{status === 'success' ? fileName : label}</p>
          <p className="text-xs text-gray-500 mt-0.5">{status === 'loading' ? 'Parsing with AI…' : status === 'success' ? '✓ Parsed successfully — click to replace' : sublabel}</p>
        </div>
      </div>
    </div>
  );
}
