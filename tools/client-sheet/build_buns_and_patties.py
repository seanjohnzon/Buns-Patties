import sys, re, html
sys.path.insert(0, '.')
from sheet_transform import transform, q
t = open('buns-and-patties.base.html').read()
costs = [
 ('Apple Developer — needed for the iPhone app', '$99 / year', 'Apple'),
 ('Google Play — needed for the Android app', '$25 once', 'Google'),
 ('Card payments on app and website orders', '2.9% + 30¢ per order', 'Square, taken from each payment — no monthly fee'),
 ('Web address (bunsandpattieshtx.com)', 'about $12 / year', 'us — registered in your business name'),
 ('Running the app: database, sign-in texts, website', 'about $30–45 / month', 'us, at cost'),
]
fine = 'Apple and Google take <b>no commission on food orders</b> (they only charge on digital goods). Your Square reader fees at the window don’t change.'
Q = [
 q('Legal business name','legal','text','exactly as registered'),
 q('Business type','entity','radio',options=['LLC','Corporation','Sole proprietor']),
 q('Web address','domain','radio',options=['bunsandpattieshtx.com is fine','I want another'],other=True,placeholder='the one you want'),
 q('D-U-N-S number','duns','text','when it arrives'),
 q('Your email and mobile','contact','text'),
 q('Apple ID email','appleid','email','for the test app invite — add any staff who will test'),
 q('Staff who work the window','staff','area','name and mobile, one per line'),
 q('Where the truck parks, and your hours','where','area'),
 q('Already use Square?','square','radio',options=['Yes','No']),
 q('Stamp card: $15+ orders — 5 = free fries, 10 = free burger','stamps','radio',options=['OK','Change it'],other=True,placeholder='what to change'),
 q('Free drink for an Instagram follow, up to 1,000','drink','radio',options=['OK','No']),
 q('Who handles refunds and complaints','refunds','text'),
 q('Your story','story','area','3–5 sentences, shown in the app'),
 q('3–5 Google reviews to show','reviews','area','the text and the first name'),
 q('Your other links','links','area','TikTok, Facebook, DoorDash, Uber Eats, Grubhub'),
 q('Food photos','photos','radio',options=['Sent','Coming']),
]
out, _ = transform(t, costs, fine, Q, 'cihanshah.sahin@gmail.com', 'bp-sheet-v1', 'Buns & Patties — answers')
open('buns-and-patties.html', 'w').write(out)

print('ok')
