import { useState, useEffect } from 'react';
import * as React from 'react';
import { ipcRenderer as ipc } from 'electron';
import { Policy } from 'src/util';

const POLICY_PREFIX = 'policy-';

function replaceNewlines(text: string) {
  return (
    <>
      {text.split('\n').map((line) => (
        <>
          {line}
          <br />
        </>
      ))}
    </>
  );
}

export function PolicyContainer({
  issuer,
  style,
}: {
  issuer: number;
  style: React.CSSProperties;
}) {
  const [sourceUrl, setSourceUrl] = useState<string>();
  const [policy, setPolicy] = useState<Policy>();

  function submit() {
    ipc.send('policy-choice', { issuer, sourceUrl, policy });
  }

  function clearPolicyStorage() {
    ipc.send('banner-clear-policies', { issuer });
  }

  function changePurpose(id: number, state: boolean) {
    setPolicy((oldPolicy) => ({
      ...oldPolicy,
      purposeChoice: { ...oldPolicy.purposeChoice, [id]: state },
    }));
    // TODO update accessor dependencies
  }

  // Set ipc channel only on initialization
  useEffect(() => {
    function setData(_: any, arg: { sourceUrl: string; policy: Policy }) {
      setPolicy(arg.policy);
      setSourceUrl(arg.sourceUrl);
    }
    ipc.on('banner-show', setData);
    return () => {
      ipc.off('banner-show', setData);
    };
  }, []);

  return (
    <div id="policy-container" style={style}>
      <div style={{ flex: '50%' }}>
        {/* Left Column for Purposes */}
        <ul>
          {policy &&
            policy.purposes.map((purpose) => (
              <li>
                <input
                  type="checkbox"
                  id={`${POLICY_PREFIX}${purpose.id}`}
                  checked={
                    policy.purposeChoice && policy.purposeChoice[purpose.id]
                  }
                  onChange={(e) => {
                    changePurpose(purpose.id, e.target.checked);
                  }}
                />
                <label htmlFor={`${POLICY_PREFIX}${purpose.id}`}>
                  {purpose.id}
                </label>
                <details style={{ display: 'inline', marginLeft: '1em' }}>
                  <summary>{purpose.description}</summary>
                  {replaceNewlines(purpose.descriptionLegal)}
                </details>
              </li>
            ))}
        </ul>
        <button id="submit-btn" onClick={submit}>
          Submit Preferences
        </button>
        <button id="whitelist-clear-btn" onClick={clearPolicyStorage}>
          &lt;Clear Whitelist&gt;
        </button>
      </div>
      <div style={{ flex: '50%' }}>
        {/* Right Column for Accessors */}
        <p>Foo Bar</p>
      </div>
    </div>
  );
}
