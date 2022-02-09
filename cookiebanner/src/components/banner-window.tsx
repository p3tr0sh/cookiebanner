import { useState, useEffect } from 'react';
import * as React from 'react';
import { ipcRenderer as ipc } from 'electron';
import { MessageContainer } from './message-container';
import { PolicyContainer } from './policy-container';

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
      <PolicyContainer
        issuer={issuer}
        style={{ display: mode === 'policy' ? 'flex' : 'none' }}
      />
      <MessageContainer
        issuer={issuer}
        style={{ display: mode === 'message' ? 'initial' : 'none' }}
      />
    </>
  );
}
