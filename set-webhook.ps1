# جایگزین کردن توکن ربات
$TOKEN = "1885743172:GGfRnPcEEBMeY04aNy8jZm3MlhpLec23Lr4"
$WEBHOOK_URL = "https://v0-translator-2wsgt3m63su.vercel.app/webhook"

$body = @{
    url = $WEBHOOK_URL
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://tapi.bale.ai/bot$TOKEN/setWebhook" -Method Post -Body $body -ContentType "application/json"
