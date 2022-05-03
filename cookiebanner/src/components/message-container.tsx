import { useState, useEffect } from 'react';
import * as React from 'react';
import { ipcRenderer as ipc } from 'electron';

import styles from '../styles/banner.module.css';
import { Policy } from 'src/util';

export function MessageContainer({
  issuer,
  visible,
}: {
  issuer: number;
  visible: boolean;
}) {
  const [headline, setHeadline] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [ignoredWarning, setIgnore] = useState<boolean>();

  // Set ipc channel only on initialization
  useEffect(() => {
    function setData(
      _: any,
      arg: { headline: string; message: string; policy: Policy },
    ) {
      setHeadline(arg.headline);
      setMessage(arg.message);
      setIgnore(!!arg.policy.ignored);
      // console.log(`ignored at start: ${arg.policy.ignored}`);
      // console.log(`ignored at start!!: ${!!arg.policy.ignored}`);
    }
    ipc.on('banner-show', setData);
    return () => {
      ipc.off('banner-show', setData);
    };
  }, []);

  function historyBack() {
    ipc.send('banner-history-back', { issuer });
  }

  function ignoreWarning() {
    console.log(`current status: ${ignoredWarning}`);
    ipc.send('banner-ignore-warning', { issuer, ignore: ignoredWarning });
  }

  return (
    visible && (
      <>
        <h1 className={styles.centering} style={{ color: '#bd1e3c' }}>
          {headline}
        </h1>
        <div id="message-container" style={{ padding: '0.5rem' }}>
          <p style={{ whiteSpace: 'pre-wrap' }}>{message}</p>
          <button onClick={historyBack}>Go back</button>
          <br />
          <label>
            <input
              type="checkbox"
              checked={ignoredWarning}
              onChange={(e) => {
                setIgnore(e.target.checked);
                console.log(e.target.checked);
              }}
            />
            Accept cookies
          </label>
          <button onClick={ignoreWarning} style={{ marginLeft: '0.5rem' }}>
            Save and proceed
          </button>
          <br />
        </div>
      </>
    )
  );
}
