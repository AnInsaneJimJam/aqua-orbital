'use client';

import {forwardRef,type ComponentProps} from 'react';
import NextLink,{useLinkStatus} from 'next/link';
import styles from './AppLink.module.css';

function NavigationHint(){
 const {pending}=useLinkStatus();
 return <span aria-hidden="true" className={styles.hint} data-pending={pending}/>;
}

/** Next owns navigation; the descendant hint only reflects its pending state. */
export const AppLink=forwardRef<HTMLAnchorElement,ComponentProps<typeof NextLink>>(function AppLink({children,className,...props},ref){
 return <NextLink {...props} ref={ref} className={[styles.link,className].filter(Boolean).join(' ')}>{children}<NavigationHint/></NextLink>;
});

export default AppLink;
