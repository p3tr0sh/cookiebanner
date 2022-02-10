import { useState, useEffect } from 'react';
import * as React from 'react';
import { ipcRenderer as ipc } from 'electron';
import { Policy } from 'src/util';

const POLICY_PREFIX = 'policy-';
const ACCESSOR_PREFIX = 'accessor-';

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
    const newPolicy = { ...policy };
    newPolicy.purposeChoice[id] = state;

    if (!newPolicy.cookieAccessorChoice) {
      newPolicy.cookieAccessorChoice = {};
    }
    // go through all accessors and (de-)activate those depending on the purpose
    for (const accessor of newPolicy.cookieAccessors) {
      if (accessor.purposes.includes(id)) {
        // if all purposeChoice dependencies are true, set choice to true, otherwise to false
        newPolicy.cookieAccessorChoice[accessor.id] = accessor.purposes.every(
          (pid) => newPolicy.purposeChoice[pid],
        );
      }
    }

    setPolicy(newPolicy);
  }

  function changeAccessor(id: number, state: boolean) {
    setPolicy((oldPolicy) => ({
      ...oldPolicy,
      cookieAccessorChoice: { ...oldPolicy.cookieAccessorChoice, [id]: state },
    }));
  }

  function isAccessorAvailable(id: number): boolean {
    return policy.cookieAccessors[id].purposes.every(
      (pid) => policy.purposeChoice[pid],
    );
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
    <>
      <h1 style={{ textAlign: 'center' }}>
        Cookie Policy for "{policy && policy.sourceUrl}"
      </h1>
      <div id="policy-container" style={style}>
        <div style={{ flex: '50%' }}>
          <h2>Purposes</h2>
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
          <h2>Cookie Accessors</h2>
          <ul>
            {policy &&
              policy.cookieAccessors.map((accessor) => (
                <li>
                  <input
                    type="checkbox"
                    id={`${ACCESSOR_PREFIX}${accessor.id}`}
                    checked={
                      policy.cookieAccessorChoice &&
                      policy.cookieAccessorChoice[accessor.id]
                    }
                    onChange={(e) => {
                      changeAccessor(accessor.id, e.target.checked);
                    }}
                    disabled={!isAccessorAvailable(accessor.id)}
                  />
                  <label htmlFor={`${ACCESSOR_PREFIX}${accessor.id}`}>
                    "{accessor.name}" depends on purposes{' '}
                    {accessor.purposes.join(', ')}
                  </label>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </>
  );
}
