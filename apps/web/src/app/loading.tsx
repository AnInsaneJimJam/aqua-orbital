import styles from './loading.module.css';

/** The App Router displays this only while the next route is actually loading. */
export default function Loading(){
 return <div className={styles.screen} role="status" aria-live="polite" aria-atomic="true">
  <div className={styles.visual} aria-hidden="true"><img src="/brand/orbital.svg" width={80} height={80} alt=""/></div>
  <p className={styles.label}>Loading Orbital Swap</p>
 </div>;
}
