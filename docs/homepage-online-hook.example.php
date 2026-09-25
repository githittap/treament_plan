<?php
// [직원허브 연동 2026-09] 접수 1건을 직원허브 문의함으로 보낸다. 실패해도 접수·메일은 그대로 진행한다.
$hub_url = 'https://texevhsxttfoqkrucfzl.supabase.co/functions/v1/consultation-notification?source=homepage';
$hub_token = '';
@include_once(G5_DATA_PATH.'/hub_token.php');   // 토큰 파일은 data/.htaccess에서 웹 접근 차단
if ($hub_token !== '' && function_exists('curl_init')) {
    $hub_body = json_encode(array(
        'name' => $wr_subject, 'phone' => $wr_7, 'category' => $wr_content, 'received_at' => date('c'),
    ), JSON_UNESCAPED_UNICODE);
    $ch = curl_init($hub_url);
    curl_setopt_array($ch, array(
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => $hub_body, CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 5, CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_HTTPHEADER => array('Content-Type: application/json', 'X-Webhook-Token: '.$hub_token, 'X-Event-Id: online-'.$wr_id),
    ));
    curl_exec($ch);
    $hub_code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($hub_code !== 200) {
        sql_query("update {$g5['write_prefix']}online set wr_10 = 'hub_pending' where wr_id = '".(int)$wr_id."'");
    }
}
?>
