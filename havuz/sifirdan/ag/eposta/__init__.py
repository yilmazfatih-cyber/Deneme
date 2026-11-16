"""eposta — MIME ileti kurma/ayrıştırma, RFC 2047 başlıklar, SMTP sunucusu/istemcisi, posta
yakalayıcı.

Genişletme: yeni bir dışa açık ad eklerseniz `__all__` listesine de yazın.
"""

from eposta.headers import HeaderInjectionError, decode_words, encode_word, format_address
from eposta.mime import Attachment, build_message, qp_decode, qp_encode
from eposta.parser import MessageFormatError, ParsedAttachment, ParsedMessage, parse_message
from eposta.smtp_client import SmtpError, send_mail
from eposta.smtp_server import Envelope, MailCatcher, SmtpServer

__all__ = [
    "Attachment",
    "Envelope",
    "HeaderInjectionError",
    "MailCatcher",
    "MessageFormatError",
    "ParsedAttachment",
    "ParsedMessage",
    "SmtpError",
    "SmtpServer",
    "build_message",
    "decode_words",
    "encode_word",
    "format_address",
    "parse_message",
    "qp_decode",
    "qp_encode",
    "send_mail",
]
