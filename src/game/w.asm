; *Z80
; *O
; *D-
; *L-
;*F W&START1
;------------
	INCLUDE "wmain.asm"
	INCLUDE "wpage.asm"
;------------
;*F w&FINAL
	MMU 3,0	; page 0 at #C000

; *L-
