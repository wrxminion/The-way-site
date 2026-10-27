// Home page box: join the email updates list (double opt-in; a confirmation email is sent before anything else).
// Separate from membership. The publishable key is public by design; the function only accepts an email and a source.
const NOTIFY_URL='https://tiuhyulxdiiiqspysfci.supabase.co/rest/v1/rpc/email_subscribe';
const NOTIFY_KEY='sb_publishable_AOufwXBzXDvMaMfh2uWUMw_iGKe2q9l';
const BAD_EMAIL='Please enter a valid email address';

const form=document.getElementById('notify-form');
const msg=document.getElementById('notify-msg');
const done=()=>{form.hidden=true;msg.textContent='You are on the list. Emails start soon; we will send one confirmation email first, and nothing else until you click it.';};

form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(form.website.value){done();return;} // honeypot: bots fill it, people never see it
  const email=form.email.value.trim();
  if(!email){msg.textContent=BAD_EMAIL+'.';form.email.focus();return;}
  const btn=form.querySelector('button');
  btn.disabled=true;msg.textContent='';
  try{
    const r=await fetch(NOTIFY_URL,{
      method:'POST',
      headers:{'apikey':NOTIFY_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({p_email:email,p_source:'splash',p_topics:['new:research','new:cases'],p_frequency:'weekly'})
    });
    if(r.status===204||r.status===200){done();return;}
    const body=r.status===400?await r.text():'';
    msg.textContent=body.includes(BAD_EMAIL)?BAD_EMAIL+'.':'Something went wrong. Please try again later.';
    if(r.status===400)form.email.focus();
  }catch{
    msg.textContent='Something went wrong. Please try again later.';
  }
  btn.disabled=false;
});
