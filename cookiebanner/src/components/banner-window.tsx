import { useState, useEffect } from 'react';
import * as React from 'react';
import { ipcRenderer as ipc } from 'electron';
import { MessageContainer } from './message-container';
import { PolicyContainer } from './policy-container';
import styles from '../styles/banner.module.css';

type Modes = 'policy' | 'message';

export function BannerWindow() {
  const [issuer, setIssuer] = useState<number>();
  const [mode, setMode] = useState<Modes>();

  // Set ipc channel only on initialization
  useEffect(() => {
    function setData(_: any, arg: { issuer: number; mode: Modes }) {
      setIssuer(arg.issuer);
      setMode(arg.mode);
    }
    ipc.on('banner-show', setData);
    return () => {
      ipc.off('banner-show', setData);
    };
  }, []);

  return (
    <>
      <PolicyContainer issuer={issuer} visible={mode === 'policy'} />
      <MessageContainer issuer={issuer} visible={mode === 'message'} />
      <button
        onClick={() => ipc.send('banner-close', { issuer })}
        className={styles.closeButton}
      >
        Cancel
      </button>
    </>
  );
}
