import { useState, useEffect } from 'react';
import * as React from 'react';
import { ipcRenderer as ipc } from 'electron';

import styles from '../styles/banner.module.css';

export function MessageContainer({
  issuer,
  visible,
}: {
  issuer: number;
  visible: boolean;
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
    <div
      id="message-container"
      style={visible ? { display: 'initial' } : { display: 'none' }}
    >
      <h1 className={styles.centering} style={{ color: '#bd1e3c' }}>
        {headline}
      </h1>
      <p>{message}</p>
      <button onClick={historyBack}>Go back</button>
    </div>
  );
}
