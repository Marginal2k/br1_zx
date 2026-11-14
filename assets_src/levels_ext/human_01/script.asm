; human_01: параметры и код задания дополнительного уровня 1999 г. (#79C0..#7E0F, 1104 байта; продолжение блока - герои, карта, экран)
; собирается sjasmplus (task.bin - из task.txt, см. tools/levels.py); подробности - docs/FORMATS.md

LEVDAT	EQU	#79C0
	ORG	LEVDAT

isRUNL	DEFB	#C9	; #C9 - обычный уровень
hTOWER	DEFB	1	; макс. число типов вооружения (1-4)
hARC	DEFB	0
hHORSE	DEFB	0
hSHILD	DEFB	0
hBLADE	DEFB	0
hmaxC	DEFB	0	; число исследуемых заклинаний священника
hmaxW	DEFB	0	; то же волшебника
hmaxB1	DEFB	1	; макс. число стандартных зданий
hmaxB2	DEFB	0	; макс. число доп. зданий
hWALL	DEFB	0	; 0/17 - можно/нельзя строить стены
kTOWER	DEFB	1	; параметры компьютера
kARC	DEFB	0
kHORSE	DEFB	0
kSHILD	DEFB	0
kBLADE	DEFB	0
kmaxC	DEFB	0
kmaxW	DEFB	0
levMAX	DEFB	1	; макс. народу в группе врага
levDEL	DEFB	#73	; средняя задержка между сборами врага
lev1ST	DEFB	#96	; начальная задержка первого сбора
levTYP	DEFB	1	; тип уровня (0 - обычный)
COLOR	DEFB	#38	; цвет поля
MASTER	DEFB	0	; кто играет: 0 люди, 1 кунги
LEVEL	DEFB	1	; номер уровня
MONEY	DEFB	0,0,0,8,0,0	; деньги (6 цифр)
WOOD	DEFB	0,0,0,6,0,0	; лес (6 цифр)
TASK_M	INCBIN	"task.bin"	; задание: 3 строки (см. task.txt)
LEVRES	DEFB	0,0,0,#2B,0,1,#7F	; текущее время прохождения
fsLAND	DEFB	4	; ландшафт 1-4
fsMUS	DEFB	5	; мелодия 0-7
SEL_T	DEFB	0
SEL_N	DEFB	0,0,0,0,0,0
sel_en	DEFB	#FF
sel_ti	DEFB	0
LED	DEFB	0,0,0,0,0,0
_msg	DEFB	0
pTX_AD	DEFW	#F0D7
TX_AD	DEFW	#F0D7
pTXdel	DEFB	0
isPLAT	DEFB	0
szPLAT	DEFB	0
bcPLAT	DEFW	#0000
adPLAT	DEFW	#0000
waPLAT	DEFB	0
onPAUS	DEFB	0
NOTA	DEFW	#7A4C
se	DEFW	#FFFF
levSND	DEFB	0
sIY56	DEFW	#0000
priv_S	DEFB	0
NOTA2	DEFW	#7A4C
priv_2	DEFB	0
pntX	DEFB	#12
pntY	DEFB	7
pntNUM	DEFB	#FF
pntDEL	DEFB	#8F
pntTAR	DEFB	#89
pntUNI	DEFB	0
pntEN	DEFB	0,1,0,0,0,0
pntMAN	DEFB	0
END_1	DEFB	0	; 0/1/2 - нет/нет врагов/нет людей
END_2	DEFB	0
TheEND	DEFB	0	; 0/1/2 - нет/победа людей/победа врагов (ставит _cLOOP)
dummy	DEFB	0,0,0,0,0,0	; резерв

;------------ процедуры: pcLOOP - каждый кадр, pcINI - при старте ------------
pcLOOP:

        jr _cLOOP                     ; 7A6B  1801

pcINI:
        ret                           ; 7A6D  c9

_cLOOP:
        ld a,(END_1)                  ; 7A6E  3a627a
        cp $02                        ; 7A71  fe02
        jr nc,L_7A93                  ; 7A73  301e
        ld hl,$7c04                   ; 7A75  21047c
        ld bc,$2000                   ; 7A78  010020
        ld de,$0006                   ; 7A7B  110600
L_7A7E:
        ld a,(hl)                     ; 7A7E  7e
        dec hl                        ; 7A7F  2b
        dec hl                        ; 7A80  2b
        inc a                         ; 7A81  3c
        jr nz,L_7A8A                  ; 7A82  2006
        ld a,(hl)                     ; 7A84  7e
        cp $08                        ; 7A85  fe08
        jr nz,L_7A8A                  ; 7A87  2001
        inc c                         ; 7A89  0c
L_7A8A:
        add hl,de                     ; 7A8A  19
        djnz L_7A7E                   ; 7A8B  10f1
        ld a,c                        ; 7A8D  79
        cp $07                        ; 7A8E  fe07
        ret c                         ; 7A90  d8
        ld a,$01                      ; 7A91  3e01
L_7A93:
        ld (TheEND),a                 ; 7A93  32647a
        ret                           ; 7A96  c9

	DEFS	#7AA0-$,#27	; заполнитель до BULL (код задания - не более 53 байт: #7A6B..#7A9F)
	DEFS	#7E00-$	; рабочие массивы BULL, MINE, HBUILD, KBUILD, BUF512 (в файле нули)

datMIN	DEFW	44,33,55,65535,65535,65535,65535,65535	; золото 8 шахт (/100)
datHER		; здесь начинаются герои (496 байт), карта (4096) и экран (6912) - в файлах heroes.txt, map.csv, screen.png
