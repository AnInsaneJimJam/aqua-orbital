import OrbitMark from '../components/OrbitMark';
import styles from './loading.module.css';

/** The App Router displays this only while the next route is actually loading. */
export default function Loading(){
 return <div className={styles.screen} role="status" aria-live="polite" aria-atomic="true">
  <div className={styles.visual} aria-hidden="true"><OrbitMark className={styles.mark}/></div>
  <p className={styles.label}>Loading Orbital</p>
 </div>;
}
