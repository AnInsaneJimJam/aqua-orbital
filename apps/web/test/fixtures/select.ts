import {type Page} from '@playwright/test';

const optionLabels:Record<string,Record<string,string>>={
 'Transaction deadline':{'60':'1 minute','180':'3 minutes','600':'10 minutes'},
 'Strategy status':{all:'All registered',active:'Active registrations',retired:'Retired registrations'},
};

/** Exercise the visible shared select, including its portal, like a user. */
export async function selectValue(page:Page,label:string,value:string){
 await page.getByRole('combobox',{name:label,exact:true}).click();
 await page.getByRole('option',{name:optionLabels[label]?.[value]??value,exact:true}).click();
}
