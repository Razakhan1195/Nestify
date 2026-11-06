import type {StatementFields} from "./statement-batch-core";
import {intakeEvidencePayload,type IntakeEvidence} from "./statement-intake-evidence";

/** The batch's reviewed data and its original travel in the same save request. */
export function statementUploadForm(input:{
 fields:StatementFields;
 evidence?:IntakeEvidence;
 requestId:string;
 homeId:string;
 expectedVersion?:string|null;
 file:Blob;
}){
 const form=new FormData();
 for(const [key,value] of Object.entries(input.fields)){
  // Recovery fields can also contain supporting_details. Serialize that once,
  // after validation, rather than allowing FormData to coerce it to a string.
  if(value!==undefined&&key!=="supporting_details")form.append(key,value);
 }
 const evidence=intakeEvidencePayload(input.evidence);
 if(evidence)form.append("supporting_details",JSON.stringify(evidence));
 form.append("requestId",input.requestId);
 form.append("expectedHomeId",input.homeId);
 form.append("reviewed","true");
 form.append("currency","CAD");
 if(input.expectedVersion)form.append("expectedVersion",input.expectedVersion);
 form.append("file",input.file);
 return form;
}
