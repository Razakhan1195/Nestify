// Release check only: authenticate the invitation sender without sending email.
// Never issue SMTP MAIL, RCPT or DATA commands or print the credential.
import tls from 'node:tls';
import {createInterface} from 'node:readline';
const key=process.env.RESEND_API_KEY;
const from=process.env.RESEND_FROM_EMAIL;
if(!key?.trim()||!from?.trim())throw new Error('Invitation email configuration is missing');
const socket=tls.connect({host:'smtp.resend.com',port:465,servername:'smtp.resend.com',rejectUnauthorized:true});
const lines=createInterface({input:socket,crlfDelay:Infinity})[Symbol.asyncIterator]();
const timeout=setTimeout(()=>socket.destroy(new Error('Invitation SMTP authentication timed out')),15000);
async function expect(code){
 for(;;){const next=await lines.next();if(next.done)throw new Error('Invitation SMTP connection closed');
  const match=/^(\d{3})([ -])/.exec(next.value);if(!match)continue;
  if(match[2]===' '){if(Number(match[1])!==code)throw new Error('Invitation SMTP authentication rejected ('+match[1]+')');return;}
 }
}
try {
 await expect(220);socket.write('EHLO rezlee.com\r\n');await expect(250);
 socket.write('AUTH LOGIN\r\n');await expect(334);
 socket.write(Buffer.from('resend').toString('base64')+'\r\n');await expect(334);
 socket.write(Buffer.from(key).toString('base64')+'\r\n');await expect(235);
 socket.write('QUIT\r\n');await expect(221);
 console.log('Invitation sender authentication passed. Emails sent: 0.');
}finally{clearTimeout(timeout);socket.destroy();}
