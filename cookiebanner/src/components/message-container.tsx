import { useState, useEffect } from 'react';
import * as React from 'react';
import { ipcRenderer as ipc } from 'electron';

export function MessageContainer({
  issuer,
  style,
}: {
  issuer: number;
  style: React.CSSProperties;
}) {
  const [headline, setHeadline] = useState<string>();
  const [message, setMessage] = useState<string>();

  // Set ipc channel only on initialization
  useEffect(() => {
    function setData(_: any, arg: { headline: string; message: string }) {
      setHeadline(arg.headline);
      setMessage(arg.message);
    }
    ipc.on('banner-show', setData);
    return () => {
      ipc.off('banner-show', setData);
    };
  }, []);

  function historyBack() {
    ipc.send('banner-history-back', { issuer });
  }

  return (
    <div id="message-container" style={style}>
      <h1>{headline}</h1>
      <p>{message}</p>
      <button onClick={historyBack}>Go back</button>
    </div>
  );
}
