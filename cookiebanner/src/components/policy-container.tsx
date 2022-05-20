import { useState, useEffect } from 'react';
import * as React from 'react';
import { ipcRenderer as ipc } from 'electron';
import { Policy, Purpose } from 'src/util';
import classNames from 'classnames';

import styles from '../styles/banner.module.css';

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
  visible,
}: {
  issuer: number;
  visible: boolean;
}) {
  const [sourceUrl, setSourceUrl] = useState<string>();
  const [policy, setPolicy] = useState<Policy>();

  function submit() {
    ipc.send('policy-choice', { issuer, state: 'selected', sourceUrl, policy });
  }

  function clearPolicyStorage() {
    ipc.send('banner-clear-policies', { issuer });
  }

  function acceptAll() {
    changeAllPurposes(true);
    submit();
  }

  function revokePolicy() {
    ipc.send('policy-choice', {
      issuer,
      state: 'not-selected',
      sourceUrl,
      policy: {},
    });
  }

  function changeAllPurposes(state: boolean) {
    if (policy) {
      policy.purposes
        .filter(isPurposeNeeded)
        .forEach((purpose) => changePurpose(purpose.id, state));
    }
  }

  function changePurpose(id: number, state: boolean) {
    const newPolicy = { ...policy };
    newPolicy.purposeChoice[id] = state;

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
    return (
      policy &&
      policy.cookieAccessors[id].purposes.every(
        (pid) => policy.purposeChoice[pid],
      )
    );
  }

  function isPurposeNeeded(purpose: Purpose): boolean {
    return policy.cookieAccessors.some((accessor) =>
      accessor.purposes.includes(purpose.id),
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
    visible && (
      <>
        <h1
          className={styles.centering}
          style={visible ? { display: 'block' } : { display: 'none' }}
        >
          Cookie Policy for "{policy && policy.sourceUrl}"
        </h1>
        <div
          id="policy-container"
          style={visible ? { display: 'flex' } : { display: 'none' }}
        >
          <div className={styles.column}>
            <h2>Purposes</h2>
            <ul className={styles.flexList}>
              <li>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={
                      policy &&
                      policy.purposes
                        .filter(isPurposeNeeded)
                        .every((purpose) => policy.purposeChoice[purpose.id])
                    }
                    onChange={(e) => {
                      changeAllPurposes(e.target.checked);
                    }}
                  />
                  <span className={styles.purposeId}>all</span>
                </label>
              </li>
              {policy &&
                policy.purposes.filter(isPurposeNeeded).map((purpose) => (
                  <li>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={policy.purposeChoice[purpose.id]}
                        onChange={(e) => {
                          changePurpose(purpose.id, e.target.checked);
                        }}
                      />
                      <span className={styles.purposeId}>{purpose.id}</span>
                    </label>
                    <details className={styles.purposeDescription}>
                      <summary className={styles.purposeSummary}>
                        {purpose.description}
                      </summary>
                      {replaceNewlines(purpose.descriptionLegal)}
                    </details>
                  </li>
                ))}
            </ul>
            <button id="submit-btn" onClick={submit}>
              Submit Preferences
            </button>
            <button id="accept-btn" onClick={acceptAll}>
              Accept all
            </button>
            <br />
            {/* <button id="whitelist-clear-btn" onClick={clearPolicyStorage}>
              &lt;Clear Whitelist&gt;
            </button> */}
            <button id="revoke-policy-btn" onClick={revokePolicy}>
              Revoke Choice
            </button>
          </div>
          <div className={styles.column}>
            <h2>Cookie Accessors</h2>
            <ul className={styles.flexList}>
              {policy &&
                policy.cookieAccessors.map((accessor) => (
                  <li>
                    <label
                      className={classNames(
                        styles.checkboxLabel,
                        !isAccessorAvailable(accessor.id) && styles.disabled,
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={policy.cookieAccessorChoice[accessor.id]}
                        onChange={(e) => {
                          changeAccessor(accessor.id, e.target.checked);
                        }}
                        disabled={!isAccessorAvailable(accessor.id)}
                      />
                      "{accessor.scope}" depends on purposes{' '}
                      {accessor.purposes.join(', ')}
                    </label>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </>
    )
  );
}
